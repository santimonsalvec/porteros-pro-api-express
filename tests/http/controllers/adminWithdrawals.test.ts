import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInAdmin, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);
const reverse = (context: TestApp, token: string, userId: string, withdrawalId: string, body: object) =>
  request(context.app).post(`/admin/goalkeepers/${userId}/withdrawals/${withdrawalId}/reversal`).set('Authorization', `Bearer ${token}`).send(body);

/** G withdraws 90 minutes before the match: suspended 3 days, the 7.000 commission kept. */
async function setUp() {
  const context = await buildTestApp({ eventsMode: 'local' });
  context.clock.set(MATCH_NOW);
  const admin = await signInAdmin(context);
  const client = await signInClient(context, 'sub-1001');
  const g = await signInGoalkeeper(context, 'sub-1002');
  await context.walletLedger.adjust(ownerOf(g.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-g' });
  const created = await createRequestAsClient(context, client.token, { goalkeeperCount: 1 });
  const bookingId = created.bookings[0]!.bookingId;
  await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${g.token}`);
  const withdrawn = await request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/withdraw`).set('Authorization', `Bearer ${g.token}`).send({});
  return { context, admin, g, bookingId, withdrawalId: withdrawn.body.withdrawal.withdrawalId as string };
}

describe('/admin/goalkeepers/:userId/withdrawals — US4: reversal', () => {
  it('reverses money and suspension: the commission comes back and G sees matches again, once', async () => {
    const { context, admin, g, withdrawalId } = await setUp();
    expect((await get(context, g.token, '/goalkeepers/me/available-bookings')).body.unavailableReason).toBe('suspended');

    const response = await reverse(context, admin.token, g.userId, withdrawalId, { refund: true, liftSuspension: true, reason: 'Incapacidad médica' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      suspendedUntil: null,
      withdrawal: {
        withdrawalId,
        forgiven: true,
        moneyReversal: { by: 'admin-1', reason: 'Incapacidad médica', amount: 7000, currency: 'COP' },
        penalties: [{ kind: 'late', reversal: { by: 'admin-1', reason: 'Incapacidad médica' } }],
      },
    });
    expect((await get(context, g.token, '/goalkeepers/me/wallet')).body.balance).toBe(20000);
    expect((await get(context, g.token, '/goalkeepers/me/available-bookings')).body.unavailableReason).toBeNull();

    const again = await reverse(context, admin.token, g.userId, withdrawalId, { refund: true, liftSuspension: true, reason: 'Otra vez' });
    expect(again.status).toBe(200);
    expect((await get(context, g.token, '/goalkeepers/me/wallet')).body.balance).toBe(20000);
  });

  it('shows the administrator in the admin history, but not in the goalkeeper\'s own', async () => {
    const { context, admin, g, withdrawalId } = await setUp();
    await reverse(context, admin.token, g.userId, withdrawalId, { liftSuspension: true, reason: 'Error operativo' });

    const forAdmin = await get(context, admin.token, `/admin/goalkeepers/${g.userId}/withdrawals`);
    const own = await get(context, g.token, '/goalkeepers/me/withdrawals');

    expect(forAdmin.status).toBe(200);
    expect(forAdmin.body.items[0].penalties[0].reversal).toMatchObject({ by: 'admin-1', reason: 'Error operativo' });
    expect(own.body.items[0].penalties[0].reversal).not.toHaveProperty('by');
  });

  it('validates the body, refuses non-administrators and unknown withdrawals', async () => {
    const { context, admin, g, withdrawalId } = await setUp();

    expect((await reverse(context, admin.token, g.userId, withdrawalId, { refund: true })).status).toBe(400);
    expect((await reverse(context, admin.token, g.userId, withdrawalId, { refund: true, reason: 'no' })).status).toBe(400);
    expect((await reverse(context, admin.token, g.userId, withdrawalId, { reason: 'Sin acción' })).status).toBe(400);
    expect((await reverse(context, g.token, g.userId, withdrawalId, { refund: true, reason: 'Me lo devuelvo' })).status).toBe(401);
    const unknown = await reverse(context, admin.token, g.userId, 'missing', { refund: true, reason: 'Incapacidad médica' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('withdrawal_not_found');
    expect((await get(context, admin.token, '/admin/goalkeepers/nobody/withdrawals')).body.error).toBe('goalkeeper_not_found');
  });
});

describe('withdrawals in the API document', () => {
  it('documents the withdraw, history and reversal endpoints', async () => {
    const context = await buildTestApp();
    const paths = Object.keys((await request(context.app).get('/openapi.json')).body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/goalkeepers/me/bookings/{bookingId}/withdraw',
        '/goalkeepers/me/withdrawals',
        '/admin/goalkeepers/{userId}/withdrawals',
        '/admin/goalkeepers/{userId}/withdrawals/{withdrawalId}/reversal',
      ]),
    );
  });
});

