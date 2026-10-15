import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInAdmin, signInClient, signInGoalkeeper, ownerOf, type TestApp } from '../operatingBalanceTestHelpers.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const mine = (context: TestApp, token: string) => request(context.app).get('/profile/account-closure').set(bearer(token));
const ask = (context: TestApp, token: string) => request(context.app).post('/profile/account-closure').set(bearer(token));
const cancel = (context: TestApp, token: string) => request(context.app).post('/profile/account-closure/cancel').set(bearer(token));
const adminPost = (context: TestApp, token: string, path: string, body: object = {}) => request(context.app).post(`/admin/account-closures${path}`).set(bearer(token)).send(body);
const adminGet = (context: TestApp, token: string, path = '') => request(context.app).get(`/admin/account-closures${path}`).set(bearer(token));

async function setUp(balance = 13000) {
  const context = await buildTestApp();
  const admin = await signInAdmin(context);
  const goalkeeper = await signInGoalkeeper(context, 'sub-2901');
  if (balance > 0) await context.operatingBalanceLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: balance, reason: 'Saldo de pruebas', operationKey: 'k-1' });
  if (balance < 0) await context.operatingBalanceLedger.applyPenalty(ownerOf(goalkeeper.userId), { penaltyEventId: 'e-1', amount: -balance });
  return { context, admin, goalkeeper };
}

describe('GET/POST /profile/account-closure — the user asks to leave (feature 029, US4)', () => {
  it('shows what a request would look like, then opens it and turns the offers off', async () => {
    const { context, goalkeeper } = await setUp();

    const before = await mine(context, goalkeeper.token);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({
      current: null,
      preview: { canRequest: true, balance: 13000, currency: 'COP', refundAmount: 13000, hasDebt: false, blockers: [] },
    });

    const created = await ask(context, goalkeeper.token);
    expect(created.status).toBe(201);
    expect(created.body.current).toMatchObject({ status: 'requested', balance: 13000, currency: 'COP', refundAmount: 13000 });
    expect((await context.goalkeeperProfileRepository.getByUserId(goalkeeper.userId))!.availableForOffers).toBe(false);
    expect((await mine(context, goalkeeper.token)).body).toMatchObject({ current: { status: 'requested' }, preview: null });
  });

  it('409 closure_blocked while there are matches to play, naming them', async () => {
    const { context, goalkeeper } = await setUp();
    context.closureBlockers.byUser.set(goalkeeper.userId, [
      { code: 'assigned_bookings', bookingId: 'b-1', startsAtLocal: '2026-10-18T19:00:00-05:00', placeName: 'Cali Norte' },
    ]);

    const response = await ask(context, goalkeeper.token);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: 'closure_blocked', blockers: [{ code: 'assigned_bookings', bookingId: 'b-1', placeName: 'Cali Norte' }] });
  });

  it('409 closure_already_open when asked twice', async () => {
    const { context, goalkeeper } = await setUp();
    await ask(context, goalkeeper.token);

    const again = await ask(context, goalkeeper.token);

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'closure_already_open', current: { status: 'requested' } });
  });

  it('lets a client with no balance leave too', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-2902');

    const created = await ask(context, client.token);

    expect(created.status).toBe(201);
    expect(created.body.current).toMatchObject({ balance: null, refundAmount: null });
  });

  it('cancels while the refund is not recorded, 404 with nothing open, 401 without a token', async () => {
    const { context, goalkeeper } = await setUp();
    expect((await cancel(context, goalkeeper.token)).status).toBe(404);
    await ask(context, goalkeeper.token);

    const cancelled = await cancel(context, goalkeeper.token);

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.current.status).toBe('cancelled');
    expect((await request(context.app).get('/profile/account-closure')).status).toBe(401);
  });
});

describe('the inactive account (feature 029, FR-021)', () => {
  it('409 account_closing for offers, available matches, accepting and a normal deposit; offers off still works', async () => {
    const { context, goalkeeper } = await setUp();
    await ask(context, goalkeeper.token);
    const auth = bearer(goalkeeper.token);

    const on = await request(context.app).put('/goalkeepers/me/offers-availability').set(auth).send({ available: true });
    const off = await request(context.app).put('/goalkeepers/me/offers-availability').set(auth).send({ available: false });
    const available = await request(context.app).get('/goalkeepers/me/available-bookings').set(auth);
    const accept = await request(context.app).post('/goalkeepers/me/bookings/b-1/accept').set(auth);
    const deposit = await request(context.app).post('/goalkeepers/me/operating-balance/deposits').set(auth).send({ amount: 20000 });

    expect([on.status, on.body.error]).toEqual([409, 'account_closing']);
    expect(off.status).toBe(200);
    expect([available.status, available.body.error]).toEqual([409, 'account_closing']);
    expect([accept.status, accept.body.error]).toEqual([409, 'account_closing']);
    expect([deposit.status, deposit.body.error]).toEqual([409, 'account_closing']);
  });

  it('409 account_closing for a client quoting a match', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-2903');
    await ask(context, client.token);

    const quote = await request(context.app).post('/goalkeeper-requests/quote').set(bearer(client.token)).send({});

    expect([quote.status, quote.body.error]).toEqual([409, 'account_closing']);
  });

  it('lets the deposit the administrator asked for through (a debt to cover)', async () => {
    const { context, admin, goalkeeper } = await setUp(-30000);
    context.paymentGatewaySettingsRepository.seed();
    await ask(context, goalkeeper.token);
    const id = (await mine(context, goalkeeper.token)).body.current.closureId as string;

    await adminPost(context, admin.token, `/${id}/debt-resolution`, { resolution: 'deposit_required' });
    const deposit = await request(context.app).post('/goalkeepers/me/operating-balance/deposits').set(bearer(goalkeeper.token)).send({ amount: 50000 });

    expect(deposit.status).not.toBe(409);
  });
});

describe('/admin/account-closures — an administrator resolves it (feature 029, US5)', () => {
  it('lists the open requests and shows the detail with what may be done', async () => {
    const { context, admin, goalkeeper } = await setUp();
    await ask(context, goalkeeper.token);

    const list = await adminGet(context, admin.token);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ status: 'requested', balanceAtRequest: 13000, user: { userId: goalkeeper.userId, role: 'goalkeeper' } });

    const detail = await adminGet(context, admin.token, `/${list.body.items[0].closureId}`);
    expect(detail.body).toMatchObject({ balance: 13000, refundAmount: 13000, allowedActions: ['refund', 'reject'], blockers: [] });
  });

  it('records the refund, then closes the account: the balance is zero and the session ends', async () => {
    const { context, admin, goalkeeper } = await setUp();
    await ask(context, goalkeeper.token);
    const id = (await adminGet(context, admin.token)).body.items[0].closureId as string;

    const refund = await adminPost(context, admin.token, `/${id}/refund`, { amount: 13000, reference: 'TRX-9', paidOn: '2026-10-15' });
    expect(refund.status).toBe(200);
    expect(refund.body).toMatchObject({ status: 'refund_recorded', balance: 0, refund: { amount: 13000, reference: 'TRX-9' }, allowedActions: ['close'] });

    const closed = await adminPost(context, admin.token, `/${id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    expect(context.adminAuditLog.entries.map((entry) => entry.action)).toEqual(expect.arrayContaining(['account_closure.refund', 'account_closure.close']));
  });

  it('maps the refusals: mismatch, debt, blockers, validation, unknown, wrong state', async () => {
    const { context, admin, goalkeeper } = await setUp();
    await ask(context, goalkeeper.token);
    const id = (await adminGet(context, admin.token)).body.items[0].closureId as string;

    const mismatch = await adminPost(context, admin.token, `/${id}/refund`, { amount: 1000, reference: 'TRX', paidOn: '2026-10-15' });
    expect([mismatch.status, mismatch.body.error, mismatch.body.balance]).toEqual([409, 'refund_amount_mismatch', 13000]);

    const invalid = await adminPost(context, admin.token, `/${id}/refund`, { amount: 13000 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fieldErrors).toMatchObject({ reference: expect.any(String), paidOn: expect.any(String) });

    context.closureBlockers.byUser.set(goalkeeper.userId, [{ code: 'open_cases', caseId: 'case-1', type: 'goalkeeper_no_show' }]);
    const blocked = await adminPost(context, admin.token, `/${id}/refund`, { amount: 13000, reference: 'TRX', paidOn: '2026-10-15' });
    expect([blocked.status, blocked.body.error]).toEqual([409, 'closure_blockers_pending']);

    expect((await adminPost(context, admin.token, `/${id}/close`)).status).toBe(409);
    expect((await adminGet(context, admin.token, '/nope')).status).toBe(404);
    expect((await adminPost(context, admin.token, `/${id}/debt-resolution`, { resolution: 'waived', reason: 'Error de cobro' })).body.error).toBe('debt_not_applicable');
  });

  it('waives a debt with a reason, and rejects a request with its reason', async () => {
    const { context, admin, goalkeeper } = await setUp(-30000);
    await ask(context, goalkeeper.token);
    const id = (await adminGet(context, admin.token)).body.items[0].closureId as string;

    const waived = await adminPost(context, admin.token, `/${id}/debt-resolution`, { resolution: 'waived', reason: 'Error de cobro' });
    expect(waived.status).toBe(200);
    expect(waived.body).toMatchObject({ debtResolution: 'waived', balance: 0 });

    const rejected = await adminPost(context, admin.token, `/${id}/reject`, { reason: 'Tiene un caso abierto' });
    expect(rejected.body).toMatchObject({ status: 'rejected', endReason: 'Tiene un caso abierto' });
    expect((await adminPost(context, admin.token, `/${id}/reject`, { reason: 'x' })).status).toBe(200);
  });

  it('401 for an app token on the admin routes', async () => {
    const { context, goalkeeper } = await setUp();
    expect((await adminGet(context, goalkeeper.token)).status).toBe(401);
  });
});

describe('signing in again after the account was closed (feature 029, FR-031)', () => {
  it('refuses the renewal while closed and brings the account back at the next sign-in', async () => {
    const { context, admin, goalkeeper } = await setUp(0);
    await ask(context, goalkeeper.token);
    const id = (await adminGet(context, admin.token)).body.items[0].closureId as string;
    await adminPost(context, admin.token, `/${id}/refund`, { amount: 0 });
    await adminPost(context, admin.token, `/${id}/close`);
    expect((await context.accountClosures.findClosedByUserId(goalkeeper.userId))?.id).toBe(id);

    context.googleValidator.registerValidCredential('cred-again', new ExternalIdentity('google', 'sub-2901', 'sub-2901@example.com'));
    const again = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-again' });

    expect(again.status).toBe(200);
    expect((await context.accountClosures.findById(id))?.status).toBe('reopened');
    expect(await context.accountClosures.findClosedByUserId(goalkeeper.userId)).toBeNull();
  });
});

describe('the administrators’ user detail shows the account state (feature 029)', () => {
  it('is active, then closing with a link to the request, then closed', async () => {
    const { context, admin, goalkeeper } = await setUp(0);
    const detail = async () => (await request(context.app).get(`/admin/users/${goalkeeper.userId}`).set(bearer(admin.token))).body;

    expect(await detail()).toMatchObject({ accountState: 'active', openClosureId: null });
    await ask(context, goalkeeper.token);
    const id = (await adminGet(context, admin.token)).body.items[0].closureId as string;
    expect(await detail()).toMatchObject({ accountState: 'closing', openClosureId: id });

    await adminPost(context, admin.token, `/${id}/refund`, { amount: 0 });
    await adminPost(context, admin.token, `/${id}/close`);
    expect(await detail()).toMatchObject({ accountState: 'closed', openClosureId: null });
  });
});
