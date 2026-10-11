import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { CSRF, seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';
import type { Permission } from '../../../src/domain/staff/permissionCatalog.js';
import { SetStaffMemberStatusCommand } from '../../../src/application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommand.js';
import { SCRIPT_ACTOR } from '../../../src/domain/staff/staffActor.js';
import { UpsertStaffRoleCommand } from '../../../src/application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommand.js';

type Method = 'get' | 'post' | 'put';

/** contracts/admin-access.md: every existing admin route and the permission it needs. */
const ROUTES: [Method, string, Permission][] = [
  ['get', '/admin/goalkeepers/g-1/wallet', 'wallets.read'],
  ['get', '/admin/goalkeepers/g-1/wallet/movements', 'wallets.read'],
  ['post', '/admin/goalkeepers/g-1/wallet/adjustments', 'wallets.adjust'],
  ['get', '/admin/goalkeepers/g-1/withdrawals', 'goalkeepers.read'],
  ['post', '/admin/goalkeepers/g-1/withdrawals/w-1/reversal', 'goalkeepers.penalties.reverse'],
  ['get', '/admin/cases', 'cases.read'],
  ['get', '/admin/cases/c-1', 'cases.read'],
  ['post', '/admin/cases/c-1/resolve', 'cases.resolve'],
  ['get', '/admin/payment-gateways/country-co', 'payments.settings.manage'],
  ['put', '/admin/payment-gateways/country-co', 'payments.settings.manage'],
  ['get', '/admin/tax-settings/country-co', 'pricing.read'],
  ['put', '/admin/tax-settings/country-co', 'pricing.manage'],
  ['get', '/admin/invoicing/settings/country-co', 'invoicing.settings.manage'],
  ['put', '/admin/invoicing/settings/country-co', 'invoicing.settings.manage'],
  ['get', '/admin/invoicing/documents', 'invoicing.read'],
  ['post', '/admin/invoicing/documents/d-1/retry', 'invoicing.retry'],
];

const call = (context: TestApp, method: Method, path: string, token?: string) => {
  const pending = request(context.app)[method](path);
  if (token) pending.set('Authorization', `Bearer ${token}`);
  return method === 'get' ? pending : pending.send({});
};

describe('admin route permissions (spec 001, US2)', () => {
  it.each(ROUTES)('%s %s needs %s', async (method, path, permission) => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0001');
    await seedRole(context, 'without', permission === 'cases.read' ? ['system.read'] : ['cases.read']);
    await seedRole(context, 'with', [permission]);
    const without = await signInStaff(context, { key: 'without', roleId: 'without' });
    const withIt = await signInStaff(context, { key: 'with', roleId: 'with' });

    expect((await call(context, method, path)).status).toBe(401);
    expect((await call(context, method, path, client.token)).status).toBe(401);
    const denied = await call(context, method, path, without.token);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'permission_denied', message: expect.any(String), permission });
    expect([401, 403]).not.toContain((await call(context, method, path, withIt.token)).status);
  });

  it('every active member reads the permission catalog', async () => {
    const context = await buildTestApp();
    await seedRole(context, 'nada', []);
    const member = await signInStaff(context, { key: 'nada', roleId: 'nada' });

    const response = await call(context, 'get', '/admin/permissions', member.token);

    expect(response.status).toBe(200);
    expect(response.body.areas).toHaveLength(16);
  });

  it('a disabled member is out within 30 seconds and cannot refresh', async () => {
    const context = await buildTestApp();
    await seedRole(context, 'soporte', ['cases.read']);
    const member = await signInStaff(context, { key: 'ana', roleId: 'soporte' });
    expect((await call(context, 'get', '/admin/cases', member.token)).status).toBe(200);

    await context.mediator.send(new SetStaffMemberStatusCommand(member.staffId, 'disabled', SCRIPT_ACTOR));
    context.clock.advance(30 * 1000);

    expect((await call(context, 'get', '/admin/cases', member.token)).status).toBe(401);
    expect((await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', member.cookie)).status).toBe(401);
  });

  it('a permission removed from the role stops working within 30 seconds', async () => {
    const context = await buildTestApp();
    await seedRole(context, 'soporte', ['cases.read']);
    const member = await signInStaff(context, { key: 'ana', roleId: 'soporte' });
    expect((await call(context, 'get', '/admin/cases', member.token)).status).toBe(200);

    await context.mediator.send(new UpsertStaffRoleCommand({ id: 'soporte', name: 'soporte', description: '', permissions: ['system.read'] }));
    context.clock.advance(30 * 1000);

    expect((await call(context, 'get', '/admin/cases', member.token)).status).toBe(403);
  });
});
