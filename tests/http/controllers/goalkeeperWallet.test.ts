import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ownerOf, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

function get(context: TestApp, token: string, path: string) {
  return request(context.app).get(`/api/goalkeepers/me/wallet${path}`).set('Authorization', `Bearer ${token}`);
}

describe('GET /api/goalkeepers/me/wallet — US2: the goalkeeper sees their balance and history', () => {
  it('200 with balance, currency, offers status and movement count', async () => {
    const context = await buildTestApp();
    const { token, userId } = await signInGoalkeeper(context, 'sub-0101');
    await context.walletLedger.adjust(ownerOf(userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-1' });
    await context.walletLedger.chargeCommission(ownerOf(userId), { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });

    const response = await get(context, token, '');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      balance: 13000,
      currency: 'COP',
      offers: { canSeeOffers: true, lowestCommission: 7000, missingAmount: 0 },
      movementCount: 2,
    });
  });

  it('shows an empty wallet and how much is missing before any movement', async () => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-0102');

    const response = await get(context, token, '');

    expect(response.body).toEqual({
      balance: 0,
      currency: 'COP',
      offers: { canSeeOffers: false, lowestCommission: 7000, missingAmount: 7000 },
      movementCount: 0,
    });
  });

  it('lists movements newest first, without invoicing or administrator data', async () => {
    const context = await buildTestApp();
    const { token, userId } = await signInGoalkeeper(context, 'sub-0103');
    await context.walletLedger.adjust(ownerOf(userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-1' });
    await context.walletLedger.chargeCommission(ownerOf(userId), { bookingId: 'b-1', requestId: 'r-1', amount: 7000 });

    const response = await get(context, token, '/movements');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(response.body.items.map((item: { type: string; amount: number; balanceAfter: number }) => [item.type, item.amount, item.balanceAfter])).toEqual([
      ['commission_charge', -7000, 13000],
      ['admin_adjustment', 20000, 20000],
    ]);
    expect(response.body.items[0]).toMatchObject({ references: { bookingId: 'b-1', requestId: 'r-1' }, cancellation: null, reason: null });
    expect(response.body.items[0]).not.toHaveProperty('invoicing');
    expect(response.body.items[1]).not.toHaveProperty('actor');
  });

  it.each(['?page=0', '?pageSize=51', '?page=abc'])('400 validation_failed for %s', async (query) => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-0104');

    const response = await get(context, token, `/movements${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
  });

  it('404 goalkeeper_not_found for a client who is not an active goalkeeper', async () => {
    const context = await buildTestApp();
    const { token } = await signInClient(context, 'sub-0105');

    expect((await get(context, token, '')).status).toBe(404);
    expect((await get(context, token, '/movements')).body.error).toBe('goalkeeper_not_found');
  });

  it('401 without a token', async () => {
    const context = await buildTestApp();

    expect((await request(context.app).get('/api/goalkeepers/me/wallet')).status).toBe(401);
  });
});
