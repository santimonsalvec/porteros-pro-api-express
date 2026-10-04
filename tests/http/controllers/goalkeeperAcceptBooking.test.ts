import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

async function setUp() {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0401');
  const goalkeeper = await signInGoalkeeper(context, 'sub-0402');
  await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-gk-1' });
  return { context, client, goalkeeper };
}

function accept(context: TestApp, token: string, bookingId: string) {
  return request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);
}

describe('POST /goalkeepers/me/bookings/:bookingId/accept — US2: assign and charge, all or nothing', () => {
  it('201 with the agenda item (client contact hidden until one hour before); the commission is charged', async () => {
    const { context, client, goalkeeper } = await setUp();
    const created = await createRequestAsClient(context, client.token);
    const bookingId = created.bookings[0]!.bookingId;

    const response = await accept(context, goalkeeper.token, bookingId);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      bookingId,
      requestId: created.requestId,
      status: 'assigned',
      earnings: 60000,
      commission: 7000,
      client: null,
      clientContactVisibleFrom: '2026-09-21T19:00:00.000Z',
    });
    context.clock.set('2026-09-21T19:00:00.000Z');
    const agenda = await request(context.app).get('/goalkeepers/me/bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(agenda.body.items[0].client).toEqual({ firstName: 'Ana', lastName: 'Portera', whatsApp: expect.stringMatching(/^\+57 /) });
    const movements = await request(context.app).get('/goalkeepers/me/wallet/movements').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(movements.body.items[0]).toMatchObject({ type: 'commission_charge', amount: -7000, balanceAfter: 13000, references: { bookingId } });
  });

  it('409 goalkeeper_not_available while offers are switched off; nothing is charged (feature 015)', async () => {
    const { context, client, goalkeeper } = await setUp();
    const bookingId = (await createRequestAsClient(context, client.token)).bookings[0]!.bookingId;
    await context.goalkeeperProfileRepository.setAvailableForOffers(goalkeeper.userId, false);

    const response = await accept(context, goalkeeper.token, bookingId);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('goalkeeper_not_available');
    expect(context.walletStore.movements().filter((movement) => movement.type === 'commission_charge')).toHaveLength(0);
    expect((await context.bookingRepository.findById(bookingId))?.status).toBe('pending_assignment');
  });

  it('200 on a repeat, with no second charge', async () => {
    const { context, client, goalkeeper } = await setUp();
    const bookingId = (await createRequestAsClient(context, client.token)).bookings[0]!.bookingId;
    await accept(context, goalkeeper.token, bookingId);

    const again = await accept(context, goalkeeper.token, bookingId);

    expect(again.status).toBe(200);
    expect(context.walletStore.movements().filter((movement) => movement.type === 'commission_charge')).toHaveLength(1);
  });

  it('409 booking_already_taken for a second goalkeeper, and the request shows partially_assigned', async () => {
    const { context, client, goalkeeper } = await setUp();
    const other = await signInGoalkeeper(context, 'sub-0403');
    await context.walletLedger.adjust(ownerOf(other.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-gk-2' });
    const created = await createRequestAsClient(context, client.token);
    const bookingId = created.bookings[0]!.bookingId;
    await accept(context, goalkeeper.token, bookingId);

    const second = await accept(context, other.token, bookingId);
    const mine = await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`);

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('booking_already_taken');
    expect(mine.body.items[0].status).toBe('partially_assigned');
  });
});

describe('POST …/accept — US3/US4: clashes and refusals over HTTP', () => {
  it('409 schedule_conflict with the conflicting booking, and 409 same_request for the other booking of a held match', async () => {
    const { context, client, goalkeeper } = await setUp();
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Más saldo', operationKey: 'k-gk-more' });
    const pair = await createRequestAsClient(context, client.token); // 15:00 local, 90 min
    const overlapping = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T16:00:00' });
    await accept(context, goalkeeper.token, pair.bookings[0]!.bookingId);

    const clash = await accept(context, goalkeeper.token, overlapping.bookings[0]!.bookingId);
    const sameMatch = await accept(context, goalkeeper.token, pair.bookings[1]!.bookingId);

    expect(clash.status).toBe(409);
    expect(clash.body).toMatchObject({ error: 'schedule_conflict', conflictingBookingId: pair.bookings[0]!.bookingId });
    expect(sameMatch.status).toBe(409);
    expect(sameMatch.body.error).toBe('same_request');
  });

  it('maps the other refusals: insufficient funds, own request, not available, not a goalkeeper', async () => {
    const context = await buildTestApp();
    context.clock.set(MATCH_NOW);
    const client = await signInClient(context, 'sub-0411');
    const poor = await signInGoalkeeper(context, 'sub-0412');
    const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
    const bookingId = created.bookings[0]!.bookingId;
    context.goalkeeperProfileRepository.seed(
      (await import('../../fixtures/walletFixtures.js')).buildGoalkeeperProfile(client.userId, { zoneIds: ['zone-cali-norte'] }),
    );
    await context.walletLedger.adjust(ownerOf(client.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-client' });

    const funds = await accept(context, poor.token, bookingId);
    const own = await accept(context, client.token, bookingId);
    const missing = await accept(context, poor.token, '01925c00-0000-7000-8000-000000000999');
    const outsider = await signInClient(context, 'sub-0413');
    const notGoalkeeper = await accept(context, outsider.token, bookingId);

    expect(funds.status).toBe(409);
    expect(funds.body).toMatchObject({ error: 'insufficient_funds', missingAmount: 7000 });
    expect(own.body.error).toBe('own_request');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('booking_not_available');
    expect(notGoalkeeper.status).toBe(404);
    expect(notGoalkeeper.body.error).toBe('goalkeeper_not_found');
  });
});
