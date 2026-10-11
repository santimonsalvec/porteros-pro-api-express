import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInAdmin, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

const KEY = '01925b10-0000-7000-8000-000000000001';
const GATEWAY = {
  gateway: 'wompi',
  publicConfig: { publicKey: 'pub_test_abc', environment: 'sandbox' },
  costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
  amounts: [10000, 20000, 30000, 50000, 100000],
};

const as = (context: TestApp, token: string) => ({
  get: (path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object = {}) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).set('User-Agent', 'Firefox').send(body),
  put: (path: string, body: object) => request(context.app).put(path).set('Authorization', `Bearer ${token}`).set('User-Agent', 'Firefox').send(body),
});

describe('admin audit log (spec 001, US3)', () => {
  it('records a VAT change with who, before, after and from where', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);
    await as(context, admin.token).put('/admin/tax-settings/country-co', { vatRateBps: 1900 });

    await as(context, admin.token).put('/admin/tax-settings/country-co', { vatRateBps: 1600 });

    expect(context.adminAuditLog.entries).toHaveLength(2);
    expect(context.adminAuditLog.entries[1]).toMatchObject({
      kind: 'write',
      actor: { staffId: 'staff-admin', userId: 'admin-1', email: 'admin@porteros.pro' },
      permission: 'pricing.manage',
      action: 'taxSettings.update',
      resourceType: 'taxSettings',
      resourceId: 'country-co',
      outcome: 'done',
      httpStatus: 200,
      before: { countryId: 'country-co', vatRateBps: 1900 },
      after: { countryId: 'country-co', vatRateBps: 1600 },
      request: { vatRateBps: 1600 },
      ip: expect.any(String),
      userAgent: 'Firefox',
    });
  });

  it('records an adjustment, its replay and a refused one', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);
    const goalkeeper = await signInGoalkeeper(context, 'sub-0201');
    const path = `/admin/goalkeepers/${goalkeeper.userId}/wallet/adjustments`;

    await as(context, admin.token).post(path, { amount: 50000, reason: 'Saldo inicial', operationKey: KEY });
    await as(context, admin.token).post(path, { amount: 50000, reason: 'Saldo inicial', operationKey: KEY });
    await as(context, admin.token).post(path, { amount: -999999, reason: 'Demasiado', operationKey: '01925b10-0000-7000-8000-000000000002' });

    expect(context.adminAuditLog.entries.map((entry) => [entry.action, entry.resourceId, entry.outcome, entry.httpStatus])).toEqual([
      ['wallet.adjust', goalkeeper.userId, 'done', 201],
      ['wallet.adjust', goalkeeper.userId, 'replayed', 200],
      ['wallet.adjust', goalkeeper.userId, 'rejected', 409],
    ]);
    expect(context.adminAuditLog.entries[0]).toMatchObject({ before: { balance: 0 }, after: { amount: 50000, balance: 50000, reason: 'Saldo inicial' } });
    expect(context.adminAuditLog.entries[2]!.errorCode).toBe('insufficient_funds');
  });

  it('never keeps the gateway key nor the invoicing configuration', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);

    await as(context, admin.token).put('/admin/payment-gateways/country-co', GATEWAY);
    await as(context, admin.token).put('/admin/invoicing/settings/country-co', { provider: 'siigo', config: { username: 'u', accessKey: 'secret-key' } });

    const stored = JSON.stringify(context.adminAuditLog.entries);
    expect(context.adminAuditLog.entries.map((entry) => entry.action)).toEqual(['paymentGatewaySettings.update', 'invoicingSettings.update']);
    expect(stored).not.toContain('pub_test_abc');
    expect(stored).not.toContain('secret-key');
    expect(stored).not.toContain('accessKey');
  });

  it('records the other writes, also when they are refused', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);
    const api = as(context, admin.token);

    await api.post('/admin/cases/missing/resolve', { note: 'Revisado' });
    await api.post('/admin/invoicing/documents/missing/retry');
    await api.post('/admin/goalkeepers/g-1/withdrawals/w-1/reversal', { refund: true, liftSuspension: false, reason: 'Error del sistema' });

    expect(context.adminAuditLog.entries.map((entry) => [entry.action, entry.resourceType, entry.outcome])).toEqual([
      ['case.resolve', 'case', 'rejected'],
      ['invoicingDocument.retry', 'invoicingDocument', 'rejected'],
      ['penalty.reverse', 'withdrawal', 'rejected'],
    ]);
  });

  it('records a refusal for lack of permission as denied', async () => {
    const context = await buildTestApp();
    await seedRole(context, 'soporte', ['cases.read']);
    const member = await signInStaff(context, { key: 'ana', roleId: 'soporte' });

    await as(context, member.token).put('/admin/tax-settings/country-co', { vatRateBps: 1900 });

    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ outcome: 'denied', permission: 'pricing.manage', httpStatus: 403, actor: expect.objectContaining({ staffId: member.staffId }) }),
    ]);
  });

  it('leaves no entry for a plain read', async () => {
    const context = await buildTestApp();
    const admin = await signInAdmin(context);

    await as(context, admin.token).get('/admin/cases');
    await as(context, admin.token).get('/admin/me');

    expect(context.adminAuditLog.entries).toEqual([]);
  });
});
