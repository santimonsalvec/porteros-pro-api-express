import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../operatingBalanceTestHelpers.js';

const cancel = (context: TestApp, token: string, path: string, body: object = { reason: 'La cancha cerró por lluvia' }) =>
  request(context.app).post(`/admin/requests/${path}`).set('Authorization', `Bearer ${token}`).send(body);

/** A request for two goalkeepers at 22:00Z: G takes the first one, the second keeps searching. Free cancellation ended. */
async function world() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-5001');
  const g = await signInGoalkeeper(context, 'sub-5002');
  await context.operatingBalanceLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-g' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 2, startsAt: '2026-09-21T17:00:00' });
  const requestId = created.requestId as string;
  const [first, second] = created.bookings.map((booking: { bookingId: string }) => booking.bookingId) as [string, string];
  expect((await request(context.app).post(`/goalkeepers/me/bookings/${first}/accept`).set('Authorization', `Bearer ${g.token}`)).status).toBe(201);
  context.clock.set('2026-09-21T21:40:00.000Z');
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, g, owner, requestId, first, second };
}

describe('administrator cancellation (spec 006 of the admin, US5)', () => {
  it('cancels the whole request past its deadline, refunds the goalkeeper once, and audits it with its reason', async () => {
    const { context, owner, g, requestId, first, second } = await world();
    const balanceBefore = (await request(context.app).get('/goalkeepers/me/operating-balance').set('Authorization', `Bearer ${g.token}`)).body.balance as number;
    context.adminAuditLog.entries.length = 0;

    const response = await cancel(context, owner.token, `${requestId}/cancel`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      outcome: 'cancelled',
      requestId,
      status: 'cancelled',
      cancelledBy: 'admin',
      cancelled: [first, second],
      refunds: 1,
      reason: 'La cancha cerró por lluvia',
    });
    const balanceAfter = (await request(context.app).get('/goalkeepers/me/operating-balance').set('Authorization', `Bearer ${g.token}`)).body.balance as number;
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
    const [entry] = context.adminAuditLog.entries;
    expect(entry).toMatchObject({ action: 'request.cancel', resourceType: 'request', resourceId: requestId, permission: 'requests.cancel', outcome: 'done' });
    expect(entry!.before).toMatchObject({ requestId, status: 'partially_assigned', bookings: expect.arrayContaining([{ bookingId: first, status: 'assigned' }]) });
    expect(entry!.after).toMatchObject({ status: 'cancelled', cancelled: [first, second], refunds: 1, reason: 'La cancha cerró por lluvia' });

    const again = await cancel(context, owner.token, `${requestId}/cancel`);
    expect(again.status).toBe(200);
    expect(again.body.outcome).toBe('replayed');
    expect(context.adminAuditLog.entries.at(-1)).toMatchObject({ outcome: 'replayed' });
    const balanceReplayed = (await request(context.app).get('/goalkeepers/me/operating-balance').set('Authorization', `Bearer ${g.token}`)).body.balance as number;
    expect(balanceReplayed).toBe(balanceAfter);
  });

  it('never shows the internal reason to the app: operatingBalance movement, notices and lists', async () => {
    const { context, owner, client, g, requestId } = await world();
    await cancel(context, owner.token, `${requestId}/cancel`);
    await request(context.app).post('/internal/sweep').set('Authorization', 'Bearer test-internal-token');

    const movements = await request(context.app).get('/goalkeepers/me/operating-balance/movements').set('Authorization', `Bearer ${g.token}`);
    const refund = (movements.body.items as { type: string }[]).find((item) => item.type === 'commission_refund');
    expect(refund).toMatchObject({ cancellation: { by: 'admin', reason: 'admin_cancelled' } });
    const clientList = await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`);
    expect(JSON.stringify(clientList.body)).toContain('"cancelled"');
    for (const body of [movements.body, clientList.body, context.notificationRepository.all()]) {
      expect(JSON.stringify(body)).not.toContain('lluvia');
    }
  });

  it('cancels one booking, leaving the other as it is', async () => {
    const { context, owner, requestId, first, second } = await world();

    const response = await cancel(context, owner.token, `${requestId}/bookings/${second}/cancel`);

    expect(response.body).toMatchObject({ outcome: 'cancelled', cancelled: [second], refunds: 0, status: 'assigned' });
    expect(context.adminAuditLog.entries.at(-1)).toMatchObject({ action: 'booking.cancel', resourceId: requestId });
    const detail = await request(context.app).get(`/admin/requests/${requestId}`).set('Authorization', `Bearer ${owner.token}`);
    const statuses = Object.fromEntries((detail.body.bookings as { bookingId: string; status: string }[]).map((booking) => [booking.bookingId, booking.status]));
    expect(statuses).toEqual({ [first]: 'assigned', [second]: 'cancelled' });
  });

  it('refuses a missing, short or long reason, and an unknown request or booking', async () => {
    const { context, owner, requestId } = await world();

    for (const body of [{}, { reason: 'no' }, { reason: 'x'.repeat(301) }]) {
      const response = await cancel(context, owner.token, `${requestId}/cancel`, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error).toBe('validation_failed');
      expect(response.body.fieldErrors).toHaveProperty('reason');
    }
    expect((await cancel(context, owner.token, 'nope/cancel')).body.error).toBe('request_not_found');
    expect((await cancel(context, owner.token, `${requestId}/bookings/nope/cancel`)).body.error).toBe('booking_not_found');
  });

  it('answers 409 with the status for a booking that ended otherwise', async () => {
    const { context, owner, client, requestId, second } = await world();
    // A booking still searching: the client may cancel it at any time.
    expect((await request(context.app).post(`/goalkeeper-requests/bookings/${requestId}/bookings/${second}/cancel`).set('Authorization', `Bearer ${client.token}`).send({})).status).toBe(200);

    const response = await cancel(context, owner.token, `${requestId}/bookings/${second}/cancel`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'booking_not_cancellable', status: 'cancelled' });
  });

  it('needs requests.cancel, a session and an admin token', async () => {
    const { context, client, requestId } = await world();
    await seedRole(context, 'soporte', ['requests.read']);
    const support = await signInStaff(context, { key: 'support', userId: 'support-user', roleId: 'soporte' });

    expect((await cancel(context, support.token, `${requestId}/cancel`)).status).toBe(403);
    expect((await cancel(context, client.token, `${requestId}/cancel`)).status).toBe(401);
    expect((await request(context.app).post(`/admin/requests/${requestId}/cancel`).send({ reason: 'abc' })).status).toBe(401);
  });
});
