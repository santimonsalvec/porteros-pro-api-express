import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';

const as = (context: TestApp, token: string) => ({
  get: (path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object = {}) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body),
  put: (path: string, body: object) => request(context.app).put(path).set('Authorization', `Bearer ${token}`).send(body),
});

describe('/admin/roles (spec 002, US3)', () => {
  it('creates, reads, updates and deletes a role, each step audited', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    const api = as(context, owner.token);

    const created = await api.post('/admin/roles', { name: 'Soporte N1', description: 'Casos', permissions: ['cases.read'] });
    const listed = await api.get('/admin/roles');
    const updated = await api.put('/admin/roles/soporte-n1', { name: 'Soporte N1', description: 'Casos', permissions: ['cases.read', 'cases.resolve'] });
    const read = await api.get('/admin/roles/soporte-n1');
    const deleted = await api.post('/admin/roles/soporte-n1/delete', { reason: 'Ya no se usa' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 'soporte-n1', memberCount: 0, system: false });
    expect(listed.body.items.map((role: { id: string }) => role.id)).toEqual(['owner', 'soporte-n1']);
    expect(listed.body.items[0]).toMatchObject({ name: 'Dueño', memberCount: 1 });
    expect(updated.status).toBe(200);
    expect(read.body.permissions).toEqual(['cases.read', 'cases.resolve']);
    expect(deleted.status).toBe(204);
    expect((await api.get('/admin/roles/soporte-n1')).status).toBe(404);
    expect(context.adminAuditLog.entries.map((entry) => [entry.action, entry.outcome])).toEqual([
      ['staffRole.create', 'done'],
      ['staffRole.update', 'done'],
      ['staffRole.delete', 'done'],
    ]);
    expect(context.adminAuditLog.entries[2]!.request).toEqual({ reason: 'Ya no se usa' });
    expect(context.adminAuditLog.entries[1]!.before).toMatchObject({ permissions: ['cases.read'] });
  });

  it('answers the conflicts with stable codes', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    await seedRole(context, 'soporte', ['cases.read']);
    await signInStaff(context, { key: 'ana', roleId: 'soporte' });
    const api = as(context, owner.token);

    const taken = await api.post('/admin/roles', { name: 'SOPORTE', permissions: [] });
    const inUse = await api.post('/admin/roles/soporte/delete', { reason: 'Limpieza' });
    const ownerEdit = await api.put('/admin/roles/owner', { name: 'Jefe', description: '', permissions: [] });
    const ownerDelete = await api.post('/admin/roles/owner/delete', { reason: 'Limpieza' });
    const missing = await api.put('/admin/roles/nope', { name: 'Nada', description: '', permissions: [] });

    expect([taken.status, taken.body.error, taken.body.fieldErrors?.name]).toEqual([409, 'role_name_taken', expect.any(String)]);
    expect([inUse.status, inUse.body.error, inUse.body.memberCount]).toEqual([409, 'role_in_use', 1]);
    expect([ownerEdit.status, ownerEdit.body.error]).toEqual([409, 'system_role_immutable']);
    expect([ownerDelete.status, ownerDelete.body.error]).toEqual([409, 'system_role_immutable']);
    expect([missing.status, missing.body.error]).toEqual([404, 'role_not_found']);
  });

  it.each([
    [{ name: 'S', permissions: [] }, 'name'],
    [{ name: 'Soporte', permissions: ['users.block'] }, 'permissions'],
    [{ name: 'Soporte', description: 'x'.repeat(301), permissions: [] }, 'description'],
    [{ name: 'Soporte' }, 'permissions'],
  ])('400 for %j', async (body, field) => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });

    const response = await as(context, owner.token).post('/admin/roles', body);

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty(field);
  });

  it('asks for a 3–300 character reason to delete', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    await seedRole(context, 'vacio', []);

    const response = await as(context, owner.token).post('/admin/roles/vacio/delete', { reason: 'no' });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty('reason');
  });

  it('a permission removed from a role stops working within 30 seconds', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    await seedRole(context, 'lector', ['staff.read']);
    const member = await signInStaff(context, { key: 'ana', roleId: 'lector' });
    expect((await as(context, member.token).get('/admin/staff')).status).toBe(200);

    await as(context, owner.token).put('/admin/roles/lector', { name: 'lector', description: '', permissions: [] });
    context.clock.advance(30 * 1000);

    expect((await as(context, member.token).get('/admin/staff')).status).toBe(403);
  });

  it('401 without a token or with an app token; 403 without the permission', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0001');
    await seedRole(context, 'lector', ['roles.read']);
    const reader = await signInStaff(context, { key: 'ana', roleId: 'lector' });

    expect((await request(context.app).get('/admin/roles')).status).toBe(401);
    expect((await as(context, client.token).get('/admin/roles')).status).toBe(401);
    expect((await as(context, reader.token).get('/admin/roles')).status).toBe(200);
    expect((await as(context, reader.token).post('/admin/roles', { name: 'Nuevo', permissions: [] })).status).toBe(403);
    expect((await as(context, reader.token).put('/admin/roles/lector', { name: 'x x', description: '', permissions: [] })).status).toBe(403);
    expect((await as(context, reader.token).post('/admin/roles/lector/delete', { reason: 'Limpieza' })).status).toBe(403);
  });
});

describe('role refusals not covered above (spec 002)', () => {
  it('validates the page, the reserved id and a malformed id', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    const api = as(context, owner.token);

    const page = await api.get('/admin/roles?page=0');
    const reserved = await api.post('/admin/roles', { id: 'owner', name: 'Jefe', permissions: [] });
    const malformed = await api.post('/admin/roles', { id: 'X', name: 'Jefe', permissions: [] });

    expect([page.status, page.body.error]).toEqual([400, 'validation_failed']);
    expect([reserved.status, reserved.body.error]).toEqual([409, 'system_role_immutable']);
    expect([malformed.status, malformed.body.error]).toEqual([400, 'validation_failed']);
  });

  it('refuses an edit with a taken name or invalid fields, and a delete of a missing role', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    await seedRole(context, 'soporte', ['cases.read']);
    await seedRole(context, 'ventas', []);
    const api = as(context, owner.token);

    const taken = await api.put('/admin/roles/ventas', { name: 'SOPORTE', description: '', permissions: [] });
    const invalid = await api.put('/admin/roles/ventas', { name: 'V', description: '', permissions: [] });
    const missing = await api.post('/admin/roles/nope/delete', { reason: 'Limpieza' });

    expect([taken.status, taken.body.error]).toEqual([409, 'role_name_taken']);
    expect([invalid.status, invalid.body.fieldErrors?.name]).toEqual([400, expect.any(String)]);
    expect([missing.status, missing.body.error]).toEqual([404, 'role_not_found']);
  });
});
