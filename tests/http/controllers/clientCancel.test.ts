import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

/** `createRequestAsClient` books 15:00 in Bogotá (20:00Z): free cancellation until 19:00Z. */
const cancelBooking = (context: TestApp, token: string, requestId: string, bookingId: string, body: object = {}) =>
  request(context.app)
    .post(`/api/goalkeeper-requests/bookings/${requestId}/bookings/${bookingId}/cancel`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
const cancelRequest = (context: TestApp, token: string, requestId: string) =>
  request(context.app).post(`/api/goalkeeper-requests/bookings/${requestId}/cancel`).set('Authorization', `Bearer ${token}`).send({});
const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/api/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);

async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-1001');
  const goalkeeper = await signInGoalkeeper(context, 'sub-1002');
  await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-1002' });
  await request(context.app).post('/api/devices').set('Authorization', `Bearer ${goalkeeper.token}`).send({ token: 'phone-1002', platform: 'android' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2 });
  const [first, second] = created.bookings.map((booking) => booking.bookingId);
  return { context, client, goalkeeper, requestId: created.requestId, first: first!, second: second! };
}

describe('client cancellation — US1: a booking nobody has taken', () => {
  it('cancels it for free and idempotently; goalkeepers stop seeing it', async () => {
    const { context, client, goalkeeper, requestId, second } = await setUp();

    const response = await cancelBooking(context, client.token, requestId, second, { reason: 'Un amigo cubre el arco' });

    expect(response.status).toBe(200);
    const statuses = Object.fromEntries(response.body.bookings.map((booking: { bookingId: string; status: string }) => [booking.bookingId, booking.status]));
    expect(statuses[second]).toBe('cancelled');
    expect(Object.values(statuses)).toContain('pending_assignment');
    const available = await request(context.app).get('/api/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(available.body.items.map((item: { bookingId: string }) => item.bookingId)).not.toContain(second);
    expect((await cancelBooking(context, client.token, requestId, second)).status).toBe(200);
  });

  it("answers 404 to another client, and 400 to a reason over 200 characters", async () => {
    const { context, requestId, second, client } = await setUp();
    const other = await signInClient(context, 'sub-1003');

    expect((await cancelBooking(context, other.token, requestId, second)).body.error).toBe('request_not_found');
    expect((await cancelBooking(context, client.token, requestId, 'nope')).body.error).toBe('booking_not_found');
    expect((await cancelBooking(context, client.token, requestId, second, { reason: 'x'.repeat(201) })).status).toBe(400);
  });
});

describe('client cancellation — US2: a taken booking', () => {
  it('in time: refunded once, the goalkeeper told, and the match cancelled in their agenda', async () => {
    const { context, client, goalkeeper, requestId, first } = await setUp();
    await accept(context, goalkeeper.token, first);
    context.clock.set('2026-09-21T18:40:00.000Z');

    const response = await cancelBooking(context, client.token, requestId, first);

    expect(response.status).toBe(200);
    const wallet = await request(context.app).get('/api/goalkeepers/me/wallet').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(wallet.body.balance).toBe(20000);
    const refunds = context.walletStore.movements().filter((movement) => movement.type === 'commission_refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.cancellation).toMatchObject({ by: 'client' });
    const notices = context.notificationRepository.all().filter((item) => item.userId === goalkeeper.userId && item.type === 'booking.cancelled');
    expect(notices).toHaveLength(1);
    expect(notices[0]!.body).toMatch(/^El cliente canceló tu partido/);
    const agenda = await request(context.app).get('/api/goalkeepers/me/bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(agenda.body.items.find((item: { bookingId: string }) => item.bookingId === first)).toMatchObject({ status: 'cancelled' });
  });

  it('too late: 409 with the deadline, and the goalkeeper keeps the match', async () => {
    const { context, client, goalkeeper, requestId, first } = await setUp();
    await accept(context, goalkeeper.token, first);
    context.clock.set('2026-09-21T19:15:00.000Z');

    const response = await cancelBooking(context, client.token, requestId, first);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'cancellation_window_closed', bookingId: first, freeCancellationUntil: '2026-09-21T19:00:00.000Z' });
    expect(context.walletStore.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(0);
  });
});

describe('client cancellation in the API document', () => {
  it('documents both cancel endpoints', async () => {
    const context = await buildTestApp();
    const paths = Object.keys((await request(context.app).get('/openapi.json')).body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/goalkeeper-requests/bookings/{requestId}/cancel',
        '/api/goalkeeper-requests/bookings/{requestId}/bookings/{bookingId}/cancel',
      ]),
    );
  });
});

describe('client cancellation — US3: the whole request', () => {
  it('in time: everything cancelled, and the same match can be requested again', async () => {
    const { context, client, goalkeeper, requestId, first } = await setUp();
    await accept(context, goalkeeper.token, first);

    const response = await cancelRequest(context, client.token, requestId);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');
    expect(context.walletStore.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(1);
    await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
  });

  it('too late with a goalkeeper assigned: 409 and nothing changes, not even the searching booking', async () => {
    const { context, client, goalkeeper, requestId, first, second } = await setUp();
    await accept(context, goalkeeper.token, first);
    context.clock.set('2026-09-21T19:15:00.000Z');

    expect((await cancelRequest(context, client.token, requestId)).status).toBe(409);

    const listed = (await request(context.app).get('/api/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`)).body.items[0];
    const statuses = Object.fromEntries(listed.bookings.map((booking: { bookingId: string; status: string }) => [booking.bookingId, booking.status]));
    expect(statuses).toEqual({ [first]: 'assigned', [second]: 'pending_assignment' });
  });
});
