import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const withdraw = (context: TestApp, token: string, bookingId: string, body: object = {}) =>
  request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/withdraw`).set('Authorization', `Bearer ${token}`).send(body);
const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);
const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

/**
 * G takes the only booking of a match, H is another funded Cali Norte goalkeeper with a phone.
 * `startsAtLocal` 15:00 (20:00Z) gives 90 minutes of notice at `MATCH_NOW` (late); 17:00 (22:00Z)
 * gives 210 (in time).
 */
async function setUp(startsAtLocal = '2026-09-21T15:00:00') {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-1001');
  const g = await signInGoalkeeper(context, 'sub-1002');
  const h = await signInGoalkeeper(context, 'sub-1003');
  for (const [goalkeeper, key] of [[g, 'k-g'], [h, 'k-h']] as const) {
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: key });
    await request(context.app).post('/api/devices').set('Authorization', `Bearer ${goalkeeper.token}`).send({ token: `phone-${key}`, platform: 'android' });
  }
  await request(context.app).post('/api/devices').set('Authorization', `Bearer ${client.token}`).send({ token: 'phone-client', platform: 'android' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: startsAtLocal });
  const bookingId = created.bookings[0]!.bookingId;
  expect((await accept(context, g.token, bookingId)).status).toBe(201);
  return { context, client, g, h, requestId: created.requestId, bookingId };
}

const statusesOf = (body: { bookings: { bookingId: string; status: string }[] }) => body.bookings.map((booking) => booking.status).sort();

describe('goalkeeper withdrawal — US1: withdraw, and a replacement is searched', () => {
  it('ends the booking without a refund and offers a replacement to others, never to G', async () => {
    const { context, client, g, h, requestId, bookingId } = await setUp('2026-09-21T17:00:00');

    const response = await withdraw(context, g.token, bookingId, { reason: 'Me salió un viaje' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      bookingId,
      status: 'goalkeeper_withdrew',
      withdrawal: { noticeMinutes: 210, late: false, replacementCreated: true, penalties: [], suspendedUntil: null },
    });
    expect((await get(context, g.token, '/api/goalkeepers/me/wallet')).body.balance).toBe(13000);

    const requests = await get(context, client.token, '/api/goalkeeper-requests/bookings');
    const mine = requests.body.items.find((item: { requestId: string }) => item.requestId === requestId);
    expect(statusesOf(mine)).toEqual(['goalkeeper_withdrew', 'pending_assignment']);
    const replacementId = mine.bookings.find((booking: { status: string }) => booking.status === 'pending_assignment').bookingId as string;

    const forH = await get(context, h.token, '/api/goalkeepers/me/available-bookings');
    expect(forH.body.items.map((item: { bookingId: string }) => item.bookingId)).toContain(replacementId);
    const forG = await get(context, g.token, '/api/goalkeepers/me/available-bookings');
    expect(forG.body.items.map((item: { bookingId: string }) => item.bookingId)).not.toContain(replacementId);
    expect((await accept(context, g.token, replacementId)).body.error).toBe('booking_not_available');

    const offersToH = context.notificationRepository.all().filter((item) => item.userId === h.userId && item.type === 'booking.available');
    expect(offersToH.map((offer) => offer.data.bookingId)).toEqual([replacementId]);
    const clientNotices = context.notificationRepository.all().filter((item) => item.userId === client.userId);
    expect(clientNotices).toEqual([expect.objectContaining({ type: 'booking.goalkeeper_withdrew', body: expect.stringContaining('Ya estamos buscando otro portero.') })]);

    const again = await withdraw(context, g.token, bookingId);
    expect(again.status).toBe(200);
    expect(again.body.withdrawal.withdrawalId).toBe(response.body.withdrawal.withdrawalId);
    expect(context.lifecycleStore.incidents()).toHaveLength(1);
  });

  it('creates no replacement once the search is over', async () => {
    const { context, g, bookingId } = await setUp();
    context.clock.set('2026-09-21T19:45:00.000Z');

    const response = await withdraw(context, g.token, bookingId);

    expect(response.status).toBe(200);
    expect(response.body.withdrawal).toMatchObject({ noticeMinutes: 15, replacementCreated: false });
  });

  it('refuses a started match, a booking not assigned to them, a long reason, and a non-goalkeeper', async () => {
    const { context, client, g, h, bookingId } = await setUp();

    expect((await withdraw(context, h.token, bookingId)).body.error).toBe('booking_not_found');
    expect((await withdraw(context, g.token, bookingId, { reason: 'x'.repeat(201) })).status).toBe(400);
    expect((await withdraw(context, client.token, bookingId)).body.error).toBe('goalkeeper_not_found');

    context.clock.set('2026-09-21T20:00:00.000Z');
    const started = await withdraw(context, g.token, bookingId);
    expect(started.status).toBe(409);
    expect(started.body).toMatchObject({ error: 'match_started', startsAt: '2026-09-21T20:00:00.000Z' });
  });

  it('refuses a booking the client already cancelled', async () => {
    const { context, client, g, requestId, bookingId } = await setUp('2026-09-21T17:00:00');
    await request(context.app)
      .post(`/api/goalkeeper-requests/bookings/${requestId}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({});

    const response = await withdraw(context, g.token, bookingId);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'booking_not_withdrawable', status: 'cancelled' });
  });
});

describe('goalkeeper withdrawal — US2: a late withdrawal suspends', () => {
  it('suspends G for 3 days: no matches, no accepting, and a notice with the end', async () => {
    const { context, g, bookingId } = await setUp();

    const response = await withdraw(context, g.token, bookingId);

    const until = '2026-09-24T18:30:00.000Z';
    expect(response.body.withdrawal).toMatchObject({ noticeMinutes: 90, late: true, penalties: [{ kind: 'late', days: 3, endsAt: until }], suspendedUntil: until });
    const available = await get(context, g.token, '/api/goalkeepers/me/available-bookings');
    expect(available.body).toMatchObject({ unavailableReason: 'suspended', suspendedUntil: until });
    const notices = context.notificationRepository.all().filter((item) => item.userId === g.userId && item.type === 'goalkeeper.suspended');
    expect(notices).toHaveLength(1);

    const client = await signInClient(context, 'sub-1004');
    const other = await createRequestAsClient(context, client.token, { goalkeeperCount: 1, startsAt: '2026-09-21T18:00:00' });
    const refused = await accept(context, g.token, other.bookings[0]!.bookingId);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: 'goalkeeper_suspended', suspendedUntil: until });
  });
});

describe('goalkeeper withdrawal — US3: the history', () => {
  it('lists their own withdrawals newest first, with the penalties, and refuses a client', async () => {
    const { context, client, g, h, bookingId } = await setUp('2026-09-21T17:00:00');
    await withdraw(context, g.token, bookingId, { reason: 'Me salió un viaje' });
    const second = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
    const secondId = second.bookings[0]!.bookingId;
    context.clock.set('2026-09-21T18:31:00.000Z');
    expect((await accept(context, g.token, secondId)).status).toBe(201);
    await withdraw(context, g.token, secondId);

    const response = await get(context, g.token, '/api/goalkeepers/me/withdrawals');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1, suspendedUntil: '2026-09-24T18:31:00.000Z' });
    expect(response.body.items.map((item: { bookingId: string; late: boolean }) => [item.bookingId, item.late])).toEqual([
      [secondId, true],
      [bookingId, false],
    ]);
    expect(response.body.items[0].penalties).toMatchObject([{ kind: 'late', days: 3 }]);
    expect(response.body.items[1]).toMatchObject({ reason: 'Me salió un viaje', penalties: [] });
    expect((await get(context, h.token, '/api/goalkeepers/me/withdrawals')).body).toMatchObject({ items: [], totalItems: 0 });
    expect((await get(context, client.token, '/api/goalkeepers/me/withdrawals')).body.error).toBe('goalkeeper_not_found');
    expect((await get(context, g.token, '/api/goalkeepers/me/withdrawals?pageSize=0')).status).toBe(400);
  });
});

