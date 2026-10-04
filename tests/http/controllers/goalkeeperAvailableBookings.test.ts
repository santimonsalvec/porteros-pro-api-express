import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

async function setUp() {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-0301');
  const goalkeeper = await signInGoalkeeper(context, 'sub-0302');
  return { context, client, goalkeeper };
}

function available(context: TestApp, token: string, query = '') {
  return request(context.app).get(`/goalkeepers/me/available-bookings${query}`).set('Authorization', `Bearer ${token}`);
}

describe('GET /goalkeepers/me/available-bookings — US1: the goalkeeper sees what they can take', () => {
  it('200 with both bookings of a 2-goalkeeper match, their earnings and commission, and no client data', async () => {
    const { context, client, goalkeeper } = await setUp();
    const created = await createRequestAsClient(context, client.token);
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-1' });

    const response = await available(context, goalkeeper.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ totalItems: 2, unavailableReason: null, missingAmount: null, suspendedUntil: null });
    expect(response.body.items.map((item: { bookingId: string }) => item.bookingId).sort()).toEqual(
      created.bookings.map((booking) => booking.bookingId).sort(),
    );
    expect(response.body.items[0]).toMatchObject({
      requestId: created.requestId,
      zoneName: 'Norte',
      cityName: 'Cali',
      durationMinutes: 90,
      goalkeeperCount: 2,
      earnings: 60000,
      commission: 7000,
      currency: 'COP',
    });
    expect(JSON.stringify(response.body)).not.toContain('Ana');
  });

  it('shows nothing, and why, when the wallet cannot cover the commission', async () => {
    const { context, client, goalkeeper } = await setUp();
    await createRequestAsClient(context, client.token);

    const response = await available(context, goalkeeper.token);

    expect(response.body).toMatchObject({ items: [], totalItems: 0, unavailableReason: 'insufficient_funds', missingAmount: 7000 });
  });

  it('shows nothing while the goalkeeper has offers switched off (feature 015)', async () => {
    const { context, client, goalkeeper } = await setUp();
    await createRequestAsClient(context, client.token);
    await context.walletLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-off' });
    await context.goalkeeperProfileRepository.setAvailableForOffers(goalkeeper.userId, false);

    const response = await available(context, goalkeeper.token);

    expect(response.body).toMatchObject({ items: [], totalItems: 0, unavailableReason: 'not_available_for_offers' });
  });

  it('404 for a client who is not an active goalkeeper, 400 for bad pagination', async () => {
    const { context, client, goalkeeper } = await setUp();

    expect((await available(context, client.token)).status).toBe(404);
    expect((await available(context, goalkeeper.token, '?pageSize=51')).status).toBe(400);
  });
});
