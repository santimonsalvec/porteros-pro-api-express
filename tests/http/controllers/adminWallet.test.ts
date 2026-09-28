import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { COLOMBIA_INVOICING } from '../../fixtures/walletFixtures.js';
import { signInAdmin, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const KEY_1 = '01925b10-0000-7000-8000-000000000001';
const KEY_2 = '01925b10-0000-7000-8000-000000000002';

async function setUp() {
  const context = await buildTestApp();
  const admin = await signInAdmin(context);
  const goalkeeper = await signInGoalkeeper(context, 'sub-0201');
  return { context, admin, goalkeeper };
}

function adjust(context: TestApp, token: string, userId: string, body: object) {
  return request(context.app)
    .post(`/api/admin/goalkeepers/${userId}/wallet/adjustments`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('/api/admin/goalkeepers/:userId/wallet — US5: admin inspection and adjustments', () => {
  it('201 for a credit, with the movement, the administrator, the reason and the balance', async () => {
    const { context, admin, goalkeeper } = await setUp();

    const response = await adjust(context, admin.token, goalkeeper.userId, { amount: 50000, reason: 'Saldo inicial de pruebas', operationKey: KEY_1 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: 'admin_adjustment',
      amount: 50000,
      balanceAfter: 50000,
      balance: 50000,
      reason: 'Saldo inicial de pruebas',
      actor: { kind: 'admin', userId: 'admin-1' },
      causeKey: `adjustment:${KEY_1}`,
      invoicing: COLOMBIA_INVOICING,
    });
  });

  it('200 with the same movement when the operation key is repeated, recording only one', async () => {
    const { context, admin, goalkeeper } = await setUp();
    const body = { amount: 50000, reason: 'Saldo inicial de pruebas', operationKey: KEY_1 };
    const first = await adjust(context, admin.token, goalkeeper.userId, body);

    const again = await adjust(context, admin.token, goalkeeper.userId, body);

    expect(again.status).toBe(200);
    expect(again.body.movementId).toBe(first.body.movementId);
    expect(context.walletStore.movements()).toHaveLength(1);
  });

  it('409 insufficient_funds for a debit that would leave the balance below 0', async () => {
    const { context, admin, goalkeeper } = await setUp();
    await adjust(context, admin.token, goalkeeper.userId, { amount: 5000, reason: 'Saldo inicial', operationKey: KEY_1 });

    const response = await adjust(context, admin.token, goalkeeper.userId, { amount: -6000, reason: 'Corrección', operationKey: KEY_2 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'insufficient_funds', balance: 5000 });
  });

  it.each([
    [{ reason: 'Saldo', operationKey: KEY_1 }, 'amount'],
    [{ amount: 0, reason: 'Saldo', operationKey: KEY_1 }, 'amount'],
    [{ amount: 1.5, reason: 'Saldo', operationKey: KEY_1 }, 'amount'],
    [{ amount: 5000, operationKey: KEY_1 }, 'reason'],
    [{ amount: 5000, reason: '  ', operationKey: KEY_1 }, 'reason'],
    [{ amount: 5000, reason: 'Saldo' }, 'operationKey'],
    [{ amount: 5000, reason: 'Saldo', operationKey: 'not-a-uuid' }, 'operationKey'],
  ])('400 validation_failed for %j, naming %s', async (body, field) => {
    const { context, admin, goalkeeper } = await setUp();

    const response = await adjust(context, admin.token, goalkeeper.userId, body);

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty(field);
    expect(context.walletStore.movements()).toHaveLength(0);
  });

  it('404 goalkeeper_not_found for a user who is not an active goalkeeper', async () => {
    const { context, admin } = await setUp();
    const client = await signInClient(context, 'sub-0202');

    const response = await adjust(context, admin.token, client.userId, { amount: 5000, reason: 'Saldo', operationKey: KEY_1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('goalkeeper_not_found');
  });

  it('403 for a non-administrator, on every admin route', async () => {
    const { context, goalkeeper } = await setUp();
    const auth = { Authorization: `Bearer ${goalkeeper.token}` };

    expect((await request(context.app).get(`/api/admin/goalkeepers/${goalkeeper.userId}/wallet`).set(auth)).status).toBe(403);
    expect((await adjust(context, goalkeeper.token, goalkeeper.userId, { amount: 5000, reason: 'Saldo', operationKey: KEY_1 })).status).toBe(403);
  });

  it("reads any goalkeeper's wallet and movements, with the administrator-only fields", async () => {
    const { context, admin, goalkeeper } = await setUp();
    await adjust(context, admin.token, goalkeeper.userId, { amount: 50000, reason: 'Saldo inicial de pruebas', operationKey: KEY_1 });
    const auth = { Authorization: `Bearer ${admin.token}` };

    const wallet = await request(context.app).get(`/api/admin/goalkeepers/${goalkeeper.userId}/wallet`).set(auth);
    const movements = await request(context.app).get(`/api/admin/goalkeepers/${goalkeeper.userId}/wallet/movements`).set(auth);

    expect(wallet.body).toMatchObject({ goalkeeperId: goalkeeper.userId, balance: 50000, currency: 'COP', movementCount: 1 });
    expect(movements.body.items[0]).toMatchObject({ actor: { kind: 'admin', userId: 'admin-1' }, invoicing: COLOMBIA_INVOICING });
  });
});
