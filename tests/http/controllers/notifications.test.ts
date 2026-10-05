import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { RunSweepCommand } from '../../../src/application/features/events/commands/runSweep/runSweepCommand.js';

const inbox = (context: TestApp, token: string, query = '') =>
  request(context.app).get(`/notifications${query}`).set('Authorization', `Bearer ${token}`);
const post = (context: TestApp, token: string, path: string) =>
  request(context.app).post(`/notifications${path}`).set('Authorization', `Bearer ${token}`).send();

/** A funded goalkeeper with a phone, and 3 matches confirmed by a client: 3 offers. */
async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0701');
  const goalkeeper = await signInGoalkeeper(context, 'sub-0702');
  await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 50000, reason: 'Saldo de pruebas', operationKey: 'k-0702' });
  await request(context.app).post('/devices').set('Authorization', `Bearer ${goalkeeper.token}`).send({ token: 'phone-0702', platform: 'android' });
  const matches = [];
  for (const startsAt of ['2026-09-21T15:00:00', '2026-09-21T18:00:00', '2026-09-21T21:00:00']) {
    matches.push(await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt }));
    context.clock.advance(1000);
  }
  return { context, client, goalkeeper, matches };
}

describe('/notifications — US3: users read their inbox, mark it read and dismiss offers', () => {
  it('lists the offers newest first, paginated, with the unread count', async () => {
    const { context, goalkeeper, matches } = await setUp();

    const page = await inbox(context, goalkeeper.token, '?page=1&pageSize=2');

    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2, unreadCount: 3 });
    expect(page.body.items.map((item: { data: { requestId: string } }) => item.data.requestId)).toEqual([matches[2]!.requestId, matches[1]!.requestId]);
    expect(page.body.items[0]).toMatchObject({
      type: 'booking.available',
      title: 'Partido disponible · Fútbol 11',
      readAt: null,
      dismissedAt: null,
      stillAvailable: true,
    });
    expect((await inbox(context, goalkeeper.token, '?pageSize=51')).status).toBe(400);
  });

  it('marks one read (idempotently) and all read', async () => {
    const { context, goalkeeper } = await setUp();
    const [first] = (await inbox(context, goalkeeper.token)).body.items;

    expect((await post(context, goalkeeper.token, `/${first.notificationId}/read`)).status).toBe(204);
    expect((await post(context, goalkeeper.token, `/${first.notificationId}/read`)).status).toBe(204);
    expect((await inbox(context, goalkeeper.token)).body.unreadCount).toBe(2);
    expect((await post(context, goalkeeper.token, '/read-all')).status).toBe(204);
    expect((await inbox(context, goalkeeper.token)).body.unreadCount).toBe(0);
  });

  it('dismisses an offer, which is never reminded again', async () => {
    const { context, goalkeeper } = await setUp();
    const items = (await inbox(context, goalkeeper.token)).body.items as Array<{ notificationId: string }>;
    for (const item of items) expect((await post(context, goalkeeper.token, `/${item.notificationId}/dismiss`)).status).toBe(204);
    const pushesBefore = context.pushSender.calls.length;

    context.clock.advance(10 * 60_000);
    await context.mediator.send(new RunSweepCommand());

    expect(context.pushSender.calls).toHaveLength(pushesBefore);
    expect((await inbox(context, goalkeeper.token)).body.items[0].dismissedAt).not.toBeNull();
  });

  it("404 for another user's entry or a malformed id; nothing changes", async () => {
    const { context, client, goalkeeper } = await setUp();
    const [first] = (await inbox(context, goalkeeper.token)).body.items;

    expect((await post(context, client.token, `/${first.notificationId}/read`)).status).toBe(404);
    expect((await post(context, client.token, `/${first.notificationId}/dismiss`)).body.error).toBe('notification_not_found');
    expect((await post(context, goalkeeper.token, '/not-an-id/read')).status).toBe(404);
    expect((await inbox(context, goalkeeper.token)).body.unreadCount).toBe(3);
  });

  it('shows an offer as no longer available once another goalkeeper takes the match', async () => {
    const { context, goalkeeper, matches } = await setUp();
    const rival = await signInGoalkeeper(context, 'sub-0703');
    await context.walletLedger.adjust(ownerOf(rival.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-0703' });
    await request(context.app)
      .post(`/goalkeepers/me/bookings/${matches[0]!.bookings[0]!.bookingId}/accept`)
      .set('Authorization', `Bearer ${rival.token}`);

    const items = (await inbox(context, goalkeeper.token)).body.items as Array<{ data: { requestId: string }; stillAvailable: boolean }>;
    const taken = items.find((item) => item.data.requestId === matches[0]!.requestId)!;

    expect(taken.stillAvailable).toBe(false);
    expect(items.filter((item) => item.stillAvailable)).toHaveLength(2);
  });

  it('an empty inbox is 200, and a request without a session is 401', async () => {
    const { context, client } = await setUp();

    expect((await inbox(context, client.token)).body).toMatchObject({ items: [], totalItems: 0, unreadCount: 0 });
    expect((await request(context.app).get('/notifications')).status).toBe(401);
  });
});

describe('/notifications in the API document', () => {
  it('documents the inbox and the offers switch', async () => {
    const context = await buildTestApp();

    const paths = Object.keys((await request(context.app).get('/openapi.json')).body.paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/notifications',
        '/notifications/read-all',
        '/notifications/{notificationId}/read',
        '/notifications/{notificationId}/dismiss',
        '/goalkeepers/me/offers-availability',
      ]),
    );
  });
});
