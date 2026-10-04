import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { RunSweepCommand } from '../../../src/application/features/events/commands/runSweep/runSweepCommand.js';

/** The match of `createRequestAsClient` starts 20:00Z; its search ends 19:30Z. */
const AFTER_SEARCH_END = '2026-09-21T19:31:00.000Z';

async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0801');
  await request(context.app).post('/devices').set('Authorization', `Bearer ${client.token}`).send({ token: 'phone-0801', platform: 'ios' });
  return { context, client };
}

const sweep = (context: TestApp) => context.mediator.send(new RunSweepCommand());
const myRequests = (context: TestApp, token: string) =>
  request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${token}`);

describe('Booking expiry — US1: a booking nobody took expires, and the client is told', () => {
  it('expires untaken bookings after the search ends, tells the client once, and hides them from goalkeepers', async () => {
    const { context, client } = await setUp();
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2 });
    const goalkeeper = await signInGoalkeeper(context, 'sub-0802');
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-0802' });

    context.clock.set(AFTER_SEARCH_END);
    await sweep(context);
    await sweep(context);

    const listed = (await myRequests(context, client.token)).body.items[0];
    expect(listed).toMatchObject({ requestId: created.requestId, status: 'expired' });
    expect(listed.bookings.map((booking: { status: string }) => booking.status)).toEqual(['expired', 'expired']);
    const notices = context.notificationRepository.all().filter((item) => item.userId === client.userId);
    expect(notices.map((item) => item.type)).toEqual(['request.expired']);
    expect(context.pushSender.calls.filter((call) => call.userId === client.userId)).toHaveLength(1);

    const available = await request(context.app).get('/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(available.body.items).toEqual([]);
    const accept = await request(context.app)
      .post(`/goalkeepers/me/bookings/${created.bookings[0]!.bookingId}/accept`)
      .set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(accept.status).toBe(404);
  });

  it('keeps the assigned booking of a "keep confirmed" request and says how many goalkeepers were found', async () => {
    const { context, client } = await setUp();
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2 });
    const goalkeeper = await signInGoalkeeper(context, 'sub-0803');
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-0803' });
    await request(context.app)
      .post(`/goalkeepers/me/bookings/${created.bookings[0]!.bookingId}/accept`)
      .set('Authorization', `Bearer ${goalkeeper.token}`);
    const movementsBefore = context.walletStore.movements().length;

    context.clock.set(AFTER_SEARCH_END);
    await sweep(context);

    const listed = (await myRequests(context, client.token)).body.items[0];
    expect(listed.status).toBe('assigned');
    expect(listed.bookings.map((booking: { status: string }) => booking.status).sort()).toEqual(['assigned', 'expired']);
    // The request outcome notice, next to 019's assignment and contacts notices.
    const outcomes = context.notificationRepository.all().filter((item) => item.userId === client.userId && item.type.startsWith('request.') && item.type.endsWith('expired'));
    expect(outcomes.map((item) => item.type)).toEqual(['request.partially_expired']);
    expect(context.walletStore.movements()).toHaveLength(movementsBefore);
  });
});
