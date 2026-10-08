import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';
import { StaffMember } from '../../../src/domain/staff/staffMember.js';
import { logger } from '../../../src/infrastructure/observability/logger.js';

const as = (context: TestApp, token: string) => ({
  get: (path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object = {}) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body),
  patch: (path: string, body: object) => request(context.app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
});

async function team(context: TestApp) {
  await seedRole(context, 'soporte', ['cases.read']);
  const owner = await signInStaff(context, { key: 'dueno' });
  await context.staffMemberRepository.add(
    StaffMember.invite({ id: 'staff-ana', email: 'ana@example.com', roleId: 'soporte', invitedBy: owner.staffId }, context.clock.now()),
  );
  return owner;
}

describe('GET /admin/staff (spec 002, US1)', () => {
  it('lists the team by email, one page at a time, with filters', async () => {
    const context = await buildTestApp();
    const owner = await team(context);

    const all = await as(context, owner.token).get('/admin/staff');
    const invited = await as(context, owner.token).get('/admin/staff?status=invited&roleId=soporte&q=AN&page=1&pageSize=5');

    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(all.body.items.map((item: { email: string }) => item.email)).toEqual(['ana@example.com', 'dueno@porteros.pro']);
    expect(invited.body.items).toEqual([
      expect.objectContaining({
        staffId: 'staff-ana',
        role: { id: 'soporte', name: 'soporte', system: false },
        status: 'invited',
        invitationExpired: false,
        invitedBy: { staffId: owner.staffId, label: 'dueno@porteros.pro' },
      }),
    ]);
  });

  it('reads one member, 404 otherwise', async () => {
    const context = await buildTestApp();
    const owner = await team(context);

    expect((await as(context, owner.token).get('/admin/staff/staff-ana')).body).toMatchObject({ email: 'ana@example.com' });
    const missing = await as(context, owner.token).get('/admin/staff/missing');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('staff_not_found');
  });

  it.each(['pageSize=51', 'page=0', 'status=x', `q=${'a'.repeat(101)}`])('400 for %s', async (query) => {
    const context = await buildTestApp();
    const owner = await team(context);

    const response = await as(context, owner.token).get(`/admin/staff?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
  });

  it('401 without a token or with an app token, 403 without staff.read', async () => {
    const context = await buildTestApp();
    await team(context);
    const client = await signInClient(context, 'sub-0001');
    await seedRole(context, 'otro', ['cases.read']);
    const member = await signInStaff(context, { key: 'otro', roleId: 'otro' });

    expect((await request(context.app).get('/admin/staff')).status).toBe(401);
    expect((await as(context, client.token).get('/admin/staff')).status).toBe(401);
    expect((await as(context, member.token).get('/admin/staff')).status).toBe(403);
    expect((await as(context, member.token).get('/admin/staff/staff-ana')).status).toBe(403);
  });
});

describe('administering members (spec 002, US2)', () => {
  it('invites, renews, changes the role, disables and enables, each with its audit entry', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    await seedRole(context, 'finanzas', ['wallets.read']);
    const api = as(context, owner.token);

    const invited = await api.post('/admin/staff', { email: ' Luis@Example.com ', roleId: 'soporte' });
    const renewed = await api.post('/admin/staff', { email: 'luis@example.com', roleId: 'finanzas' });
    const changed = await api.patch(`/admin/staff/${invited.body.staffId}`, { roleId: 'soporte', reason: 'Pasa a casos' });
    const disabled = await api.post(`/admin/staff/${invited.body.staffId}/disable`, { reason: 'Salió del equipo' });
    const enabled = await api.post(`/admin/staff/${invited.body.staffId}/enable`, { reason: 'Volvió' });

    expect([invited.status, invited.body.email, invited.body.status, invited.body.role.id]).toEqual([201, 'luis@example.com', 'invited', 'soporte']);
    expect([renewed.status, renewed.body.role.id]).toEqual([200, 'finanzas']);
    expect([changed.status, changed.body.role.id]).toEqual([200, 'soporte']);
    expect([disabled.status, disabled.body.status]).toEqual([200, 'disabled']);
    expect([enabled.status, enabled.body.status]).toEqual([200, 'invited']);
    expect(context.adminAuditLog.entries.map((entry) => entry.action)).toEqual([
      'staff.invite',
      'staff.invite',
      'staff.changeRole',
      'staff.disable',
      'staff.enable',
    ]);
    expect(context.adminAuditLog.entries[3]).toMatchObject({ request: { reason: 'Salió del equipo' }, before: { status: 'invited' }, after: { status: 'disabled' } });
  });

  it('answers each refusal with its code', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    const api = as(context, owner.token);

    const member = await api.post('/admin/staff', { email: 'dueno@porteros.pro', roleId: 'soporte' });
    const role = await api.post('/admin/staff', { email: 'x@example.com', roleId: 'nope' });
    const email = await api.post('/admin/staff', { email: 'nope', roleId: 'soporte' });
    const self = await api.post(`/admin/staff/${owner.staffId}/disable`, { reason: 'Prueba' });
    const lastOwner = await api.patch(`/admin/staff/${owner.staffId}`, { roleId: 'soporte', reason: 'Prueba' });
    const missing = await api.post('/admin/staff/missing/disable', { reason: 'Prueba' });
    const noReason = await api.post('/admin/staff/staff-ana/disable', { reason: 'no' });

    expect([member.status, member.body.error]).toEqual([409, 'already_member']);
    expect([role.status, role.body.error]).toEqual([404, 'role_not_found']);
    expect([email.status, email.body.error, email.body.fieldErrors?.email]).toEqual([400, 'validation_failed', expect.any(String)]);
    expect([self.status, self.body.error]).toEqual([409, 'cannot_disable_self']);
    expect([lastOwner.status, lastOwner.body.error]).toEqual([409, 'last_owner']);
    expect([missing.status, missing.body.error]).toEqual([404, 'staff_not_found']);
    expect([noReason.status, noReason.body.fieldErrors?.reason]).toEqual([400, expect.any(String)]);
  });

  it('a non-owner with staff.manage manages everyone but the owners', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    await seedRole(context, 'gestor', ['staff.read', 'staff.manage']);
    const manager = await signInStaff(context, { key: 'gestor', roleId: 'gestor' });
    const api = as(context, manager.token);

    expect((await api.post('/admin/staff', { email: 'socio@example.com', roleId: 'owner' })).body.error).toBe('owner_requires_owner');
    expect((await api.post(`/admin/staff/${owner.staffId}/disable`, { reason: 'Prueba' })).body.error).toBe('owner_requires_owner');
    expect((await api.patch(`/admin/staff/${owner.staffId}`, { roleId: 'soporte', reason: 'Prueba' })).body.error).toBe('owner_requires_owner');
    expect((await api.patch('/admin/staff/staff-ana', { roleId: 'owner', reason: 'Prueba' })).body.error).toBe('owner_requires_owner');
    expect((await api.post('/admin/staff/staff-ana/disable', { reason: 'Prueba' })).status).toBe(200);
  });

  it('a disabled member is out within 30 seconds', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    const member = await signInStaff(context, { key: 'ana2', roleId: 'soporte' });
    await seedRole(context, 'soporte', ['cases.read']);

    await as(context, owner.token).post(`/admin/staff/${member.staffId}/disable`, { reason: 'Salió' });
    context.clock.advance(30 * 1000);

    expect((await as(context, member.token).get('/admin/cases')).status).toBe(401);
  });

  it('403 without staff.manage for every write', async () => {
    const context = await buildTestApp();
    await team(context);
    await seedRole(context, 'lector', ['staff.read']);
    const reader = await signInStaff(context, { key: 'lector', roleId: 'lector' });
    const api = as(context, reader.token);

    expect((await api.post('/admin/staff', { email: 'a@b.co', roleId: 'soporte' })).status).toBe(403);
    expect((await api.patch('/admin/staff/staff-ana', { roleId: 'soporte', reason: 'Prueba' })).status).toBe(403);
    expect((await api.post('/admin/staff/staff-ana/disable', { reason: 'Prueba' })).status).toBe(403);
    expect((await api.post('/admin/staff/staff-ana/enable', { reason: 'Prueba' })).status).toBe(403);
  });
});


describe('team refusals not covered above (spec 002)', () => {
  it('validates the list filters and the role change', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    const api = as(context, owner.token);

    const badFilter = await api.get('/admin/staff?status=gone&pageSize=999');
    const noRole = await api.patch('/admin/staff/staff-ana', { reason: 'Prueba' });
    const noBody = await request(context.app).post('/admin/staff').set('Authorization', `Bearer ${owner.token}`);

    expect([badFilter.status, badFilter.body.error]).toEqual([400, 'validation_failed']);
    expect([noRole.status, noRole.body.fieldErrors?.roleId]).toEqual([400, expect.any(String)]);
    expect([noBody.status, noBody.body.error]).toEqual([400, 'validation_failed']);
  });

  it('answers 404 to a role change of a missing member or to a missing role', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    const api = as(context, owner.token);

    const member = await api.patch('/admin/staff/missing', { roleId: 'soporte', reason: 'Prueba' });
    const role = await api.patch('/admin/staff/staff-ana', { roleId: 'nope', reason: 'Prueba' });

    expect([member.status, member.body.error]).toEqual([404, 'staff_not_found']);
    expect([role.status, role.body.error]).toEqual([404, 'role_not_found']);
  });
});

describe('an audit entry the log cannot take (spec 002)', () => {
  it('keeps the write and logs the entry by ids, with every email masked', async () => {
    const context = await buildTestApp();
    const owner = await team(context);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never);
    context.adminAuditLog.failNext = 10;

    const disabled = await as(context, owner.token).post('/admin/staff/staff-ana/disable', { reason: 'Salió del equipo' });
    const invited = await as(context, owner.token).post('/admin/staff', { email: 'luis@example.com', roleId: 'soporte' });

    expect([disabled.status, invited.status]).toEqual([200, 201]);
    const logged = error.mock.calls.map(([value]) => value as { audit?: string }).filter((value) => value.audit === 'admin_audit_unwritten');
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ entry: { action: 'staff.disable', actor: { staffId: owner.staffId, userId: owner.userId }, before: { email: 'a***@example.com' } } });
    expect(logged[1]).toMatchObject({ entry: { action: 'staff.invite', resourceId: 'l***@example.com' } });
    for (const address of ['dueno@porteros.pro', 'ana@example.com', 'luis@example.com']) expect(JSON.stringify(logged)).not.toContain(address);
    error.mockRestore();
  });
});
