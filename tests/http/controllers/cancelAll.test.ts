import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { RunSweepCommand } from '../../../src/application/features/events/commands/runSweep/runSweepCommand.js';

/** The match starts 15:00 in Bogotá (20:00Z); "cancel all" is evaluated at 19:00Z. */
const START_LOCAL = '2026-09-21T15:00:00';
const EVALUATION = '2026-09-21T19:00:00.000Z';

const quote = (context: TestApp, token: string, goalkeeperCount: 1 | 2 = 2) =>
  request(context.app)
    .post('/goalkeeper-requests/quote')
    .set('Authorization', `Bearer ${token}`)
    .send({ latitude: 3.45, longitude: -76.5, startsAt: START_LOCAL, goalkeeperCount, durationMinutes: 90 });
const confirm = (context: TestApp, token: string, quoteId: string, partialFulfillment: 'cancel_all' | 'keep_confirmed') =>
  request(context.app).post('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${token}`).send({ quoteId, partialFulfillment });
const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);
const sweep = (context: TestApp) => context.mediator.send(new RunSweepCommand());

async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0901');
  const goalkeeper = await signInGoalkeeper(context, 'sub-0902');
  await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-0902' });
  for (const [who, token] of [['c', client.token], ['g', goalkeeper.token]] as const) {
    await request(context.app).post('/devices').set('Authorization', `Bearer ${token}`).send({ token: `phone-${who}-09`, platform: 'android' });
  }
  return { context, client, goalkeeper };
}

describe('"Cancel all" — US2: applied automatically when the match is not complete', () => {
  it('cancels the whole request, refunds the goalkeeper once, and tells both once', async () => {
    const { context, client, goalkeeper } = await setUp();
    const quoted = await quote(context, client.token);
    expect(quoted.body).toMatchObject({ cancelAllAvailable: true, cancelAllUntil: EVALUATION });
    const created = await confirm(context, client.token, quoted.body.quoteId, 'cancel_all');
    expect(created.status).toBe(201);
    const [taken] = created.body.bookings as Array<{ bookingId: string }>;
    expect((await accept(context, goalkeeper.token, taken!.bookingId)).status).toBe(201);

    context.clock.set('2026-09-21T19:00:30.000Z');
    await sweep(context);
    await sweep(context);

    const listed = (await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`)).body.items[0];
    expect(listed).toMatchObject({ status: 'cancelled' });
    expect(listed.bookings.map((booking: { status: string }) => booking.status)).toEqual(['cancelled', 'cancelled']);

    const refunds = context.walletStore.movements().filter((movement) => movement.type === 'commission_refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: 7000, cancellation: { by: 'system', reason: 'cancel_all' }, references: { bookingId: taken!.bookingId } });
    const wallet = await request(context.app).get('/goalkeepers/me/wallet').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(wallet.body.balance).toBe(20000);

    const agenda = await request(context.app).get('/goalkeepers/me/bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(agenda.body.items.find((item: { bookingId: string }) => item.bookingId === taken!.bookingId)).toMatchObject({ status: 'cancelled' });

    // 016's outcome notices (019's assignment notice is left aside).
    const notices = context.notificationRepository.all().filter((item) => item.dedupeKey && !item.dedupeKey.startsWith('goalkeeper-assigned:'));
    expect(notices.map((item) => [item.userId, item.type]).sort()).toEqual(
      [
        [client.userId, 'request.cancelled'],
        [goalkeeper.userId, 'booking.cancelled'],
      ].sort(),
    );
  });

  it('keeps a complete request firm', async () => {
    const { context, client, goalkeeper } = await setUp();
    const second = await signInGoalkeeper(context, 'sub-0903');
    await context.walletLedger.adjust(ownerOf(second.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-0903' });
    const created = await confirm(context, client.token, (await quote(context, client.token)).body.quoteId, 'cancel_all');
    const [a, b] = created.body.bookings as Array<{ bookingId: string }>;
    await accept(context, goalkeeper.token, a!.bookingId);
    await accept(context, second.token, b!.bookingId);

    context.clock.set('2026-09-21T19:00:30.000Z');
    await sweep(context);

    const listed = (await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`)).body.items[0];
    expect(listed.status).toBe('assigned');
    expect(context.walletStore.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(0);
  });

  it('lets the client request the same match again after the cancellation', async () => {
    const { context, client } = await setUp();
    await confirm(context, client.token, (await quote(context, client.token)).body.quoteId, 'cancel_all');
    context.clock.set('2026-09-21T19:00:30.000Z');
    await sweep(context);

    const again = await quote(context, client.token);
    expect(again.body.cancelAllAvailable).toBe(false);
    expect((await confirm(context, client.token, again.body.quoteId, 'keep_confirmed')).status).toBe(201);
  });
});

describe('late "cancel all" — clarification 1', () => {
  it('is not offered, and refused, once the free-cancellation period started; "keep confirmed" still works', async () => {
    const { context, client } = await setUp();
    context.clock.set('2026-09-21T19:05:00.000Z');

    const late = await quote(context, client.token, 1);
    expect(late.body).toMatchObject({ cancelAllAvailable: false, cancelAllUntil: EVALUATION });

    const refused = await confirm(context, client.token, late.body.quoteId, 'cancel_all');
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: 'cancel_all_not_available', cancelAllUntil: EVALUATION });

    expect((await confirm(context, client.token, late.body.quoteId, 'keep_confirmed')).status).toBe(201);
  });
});
