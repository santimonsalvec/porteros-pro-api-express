import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);

async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-1911');
  const g = await signInGoalkeeper(context, 'sub-1912');
  const h = await signInGoalkeeper(context, 'sub-1913');
  for (const [goalkeeper, key] of [[g, 'k-g'], [h, 'k-h']] as const) {
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: key });
  }
  await request(context.app).post('/devices').set('Authorization', `Bearer ${client.token}`).send({ token: 'phone-client', platform: 'android' });
  const inbox = (userId: string) => context.notificationRepository.all().filter((item) => item.userId === userId);
  return { context, client, g, h, inbox };
}

describe('client assignment notices — US1 and US2, end to end', () => {
  it('tells the client "assigned" for the first goalkeeper and "complete" for the second, without names before the last hour', async () => {
    const { context, client, g, h, inbox } = await setUp();
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2, startsAt: '2026-09-21T17:00:00' });
    const [first, second] = created.bookings.map((booking) => booking.bookingId);

    await accept(context, g.token, first!);
    expect(inbox(client.userId)).toMatchObject([{ type: 'booking.goalkeeper_assigned', data: { requestId: created.requestId, bookingId: first } }]);

    await accept(context, h.token, second!);
    expect(inbox(client.userId).map((item) => item.type).sort()).toEqual(['booking.goalkeeper_assigned', 'request.complete']);
    const complete = inbox(client.userId).find((item) => item.type === 'request.complete')!;
    expect(complete.body).toMatch(/Tus 2 porteros están confirmados .* Verás sus datos 1 hora antes\.$/);
    expect(JSON.stringify(inbox(client.userId))).not.toMatch(/\+57/);
  });

  it('sends only "complete" for a 1-goalkeeper request', async () => {
    const { context, client, g, inbox } = await setUp();
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T17:00:00' });

    await accept(context, g.token, created.bookings[0]!.bookingId);

    expect(inbox(client.userId).map((item) => item.type)).toEqual(['request.complete']);
  });

  it('names the goalkeeper when the booking is taken in the last hour', async () => {
    const { context, client, g, inbox } = await setUp();
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 }); // 20:00Z
    context.clock.set('2026-09-21T19:10:00.000Z');

    await accept(context, g.token, created.bookings[0]!.bookingId);

    expect(inbox(client.userId)[0]!.body).toMatch(/Es .* · WhatsApp \+57 /);
  });
});

describe('contacts-visible notices — US4, end to end', () => {
  it('tells the client and the goalkeeper who the other is at start − 60, once', async () => {
    const { context, client, g, inbox } = await setUp();
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T17:00:00' }); // 22:00Z
    await accept(context, g.token, created.bookings[0]!.bookingId);
    context.clock.set('2026-09-21T21:00:00.000Z');
    const sweep = () => request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

    expect((await sweep()).status).toBe(200);
    await sweep();

    expect(inbox(client.userId).filter((item) => item.type === 'request.contacts_visible')).toHaveLength(1);
    expect(inbox(client.userId).find((item) => item.type === 'request.contacts_visible')!.body).toMatch(/WhatsApp \+57 /);
    expect(inbox(g.userId).filter((item) => item.type === 'booking.client_contact_visible')).toHaveLength(1);
  });
});

