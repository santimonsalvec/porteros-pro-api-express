import { describe, expect, it } from 'vitest';
import { adminGet, memberWith } from '../financeTestHelpers.js';
import { buildTestApp } from '../testAppFactory.js';
import { signInStaff } from '../adminTestHelpers.js';
import { ownerOf, signInGoalkeeper } from '../operatingBalanceTestHelpers.js';

// Admin spec 007, US3 (contracts/finance-api.md §1).

async function world() {
  const context = await buildTestApp();
  const g1 = await signInGoalkeeper(context, 'sub-7101');
  const g2 = await signInGoalkeeper(context, 'sub-7102');
  await context.operatingBalanceLedger.adjust(ownerOf(g1.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo', operationKey: 'k-1' });
  await context.operatingBalanceLedger.adjust(ownerOf(g2.userId), { adminUserId: 'admin-1', amount: 5000, reason: 'Saldo', operationKey: 'k-2' });
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, owner, g1, g2 };
}

describe('admin operatingBalances (spec 007 of the admin, US3)', () => {
  it('lists the operatingBalances with the goalkeeper and the place, ordered by balance', async () => {
    const { context, owner, g1, g2 } = await world();

    const response = await adminGet(context, '/admin/operating-balances?sort=balance_desc', owner.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ totalItems: 2, page: 1, pageSize: 20 });
    expect(response.body.items.map((row: { goalkeeper: { userId: string } }) => row.goalkeeper.userId)).toEqual([g1.userId, g2.userId]);
    expect(response.body.items[0]).toMatchObject({ balance: 20000, currency: 'COP', marketName: 'Cali', countryName: 'Colombia' });
    expect((await adminGet(context, '/admin/operating-balances?negative=true', owner.token)).body.totalItems).toBe(0);
  });

  it('refuses malformed filters', async () => {
    const { context, owner } = await world();
    for (const query of ['sort=name', 'negative=yes', 'pageSize=500']) {
      expect((await adminGet(context, `/admin/operating-balances?${query}`, owner.token)).status, query).toBe(400);
    }
  });

  it('refuses without a session, without operating_balances.read, and with an app token', async () => {
    const { context, g1 } = await world();
    const member = await memberWith(context, 'recargas', ['deposits.read']);
    expect((await adminGet(context, '/admin/operating-balances')).status).toBe(401);
    expect((await adminGet(context, '/admin/operating-balances', g1.token)).status).toBe(401);
    expect((await adminGet(context, '/admin/operating-balances', member.token)).status).toBe(403);
  });
});
