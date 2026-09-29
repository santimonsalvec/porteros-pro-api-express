import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

function agenda(context: TestApp, token: string, query = '') {
  return request(context.app).get(`/api/goalkeepers/me/bookings${query}`).set('Authorization', `Bearer ${token}`);
}

describe('GET /api/goalkeepers/me/bookings — US6: the goalkeeper\'s agenda', () => {
  it("shows the accepted booking with the client's contact, and never another goalkeeper's", async () => {
    const context = await buildTestApp();
    context.clock.set(MATCH_NOW);
    const client = await signInClient(context, 'sub-0601');
    const mine = await signInGoalkeeper(context, 'sub-0602');
    const other = await signInGoalkeeper(context, 'sub-0603');
    for (const [goalkeeper, key] of [[mine, 'k-1'], [other, 'k-2']] as const) {
      await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: key });
    }
    const created = await createRequestAsClient(context, client.token);
    const [first, second] = created.bookings.map((booking: { bookingId: string }) => booking.bookingId);
    await request(context.app).post(`/api/goalkeepers/me/bookings/${first}/accept`).set('Authorization', `Bearer ${mine.token}`);
    await request(context.app).post(`/api/goalkeepers/me/bookings/${second}/accept`).set('Authorization', `Bearer ${other.token}`);
    context.clock.set('2026-09-21T19:00:00.000Z'); // the client's contact shows from one hour before (feature 019)

    const response = await agenda(context, mine.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        bookingId: first,
        requestId: created.requestId,
        status: 'assigned',
        client: { firstName: 'Ana', lastName: 'Portera', whatsApp: '+57 300 000 0601' },
      }),
    ]);
  });

  it('400 validation_failed for a bad page size, 404 goalkeeper_not_found for a client', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0611');
    const goalkeeper = await signInGoalkeeper(context, 'sub-0612');

    const bad = await agenda(context, goalkeeper.token, '?pageSize=51');
    const notGoalkeeper = await agenda(context, client.token);

    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('validation_failed');
    expect(notGoalkeeper.status).toBe(404);
    expect(notGoalkeeper.body.error).toBe('goalkeeper_not_found');
  });
});
