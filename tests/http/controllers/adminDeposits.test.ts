import { describe, expect, it } from 'vitest';
import { adminGet, memberWith, depositWorld } from '../financeTestHelpers.js';

// Admin spec 007, US1 (contracts/finance-api.md §2 and §4).

describe('admin deposits (spec 007 of the admin, US1)', () => {
  it('lists the deposits with the goalkeeper and the country, newest first, and filters them', async () => {
    const { context, owner, goalkeeper, depositId } = await depositWorld();

    const all = await adminGet(context, '/admin/deposits', owner.token);

    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(all.body.items[0]).toMatchObject({
      depositId,
      goalkeeper: { userId: goalkeeper.userId },
      countryName: 'Colombia',
      amount: 20000,
      cost: 1464,
      net: 18536,
      currency: 'COP',
      gateway: 'wompi',
      environment: 'sandbox',
      status: 'pending',
    });
    const count = async (query: string) => (await adminGet(context, `/admin/deposits?${query}`, owner.token)).body.totalItems as number;
    expect(await count('status=pending')).toBe(1);
    expect(await count('status=approved')).toBe(0);
    expect(await count(`goalkeeperId=${goalkeeper.userId}`)).toBe(1);
    expect(await count('goalkeeperId=someone-else')).toBe(0);
    expect(await count('from=2099-01-01T00:00:00.000Z')).toBe(0);
  });

  it('gives the detail with its checks and what comes next, never a secret', async () => {
    const { context, owner, depositId, reference } = await depositWorld();

    const detail = await adminGet(context, `/admin/deposits/${depositId}`, owner.token);

    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ depositId, reference, checks: 0, checkLog: [], canReconcile: true, nextCheckAt: expect.any(String), expiresAt: expect.any(String) });
    expect(JSON.stringify(detail.body)).not.toMatch(/prv_|events_|integrity|secret/i);
  });

  it('answers 404 for an unknown deposit and 400 for malformed filters', async () => {
    const { context, owner } = await depositWorld();
    const missing = await adminGet(context, '/admin/deposits/nope', owner.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('deposit_not_found');
    for (const query of ['status=paid', 'from=ayer', 'from=2026-10-14T00:00:00.000Z&to=2026-10-13T00:00:00.000Z', 'page=0', 'pageSize=500']) {
      const response = await adminGet(context, `/admin/deposits?${query}`, owner.token);
      expect(response.status, query).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
  });

  it('refuses without a session, without deposits.read, and with an app token', async () => {
    const { context, goalkeeper, depositId } = await depositWorld();
    const support = await memberWith(context, 'soporte', ['operating_balances.read']);
    context.adminAuditLog.entries.length = 0;

    expect((await adminGet(context, '/admin/deposits')).status).toBe(401);
    expect((await adminGet(context, '/admin/deposits', goalkeeper.token)).status).toBe(401);
    expect((await adminGet(context, `/admin/deposits/${depositId}`, support.token)).status).toBe(403);
    expect(context.adminAuditLog.entries).toEqual([expect.objectContaining({ outcome: 'denied', permission: 'deposits.read' })]);
  });
});
