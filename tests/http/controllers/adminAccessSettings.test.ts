import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';

const LIMITS = { min: 1, max: 10, recommended: 2 };

describe('Configuración → Acceso — /admin/access-settings (admin spec 009, US4)', () => {
  it('reads the default expiry and saves a new one at the revision read', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    const auth = { Authorization: `Bearer ${owner.token}` };

    const initial = await request(context.app).get('/admin/access-settings').set(auth);
    const saved = await request(context.app).put('/admin/access-settings').set(auth).send({ revision: 0, loginCodeExpiryMinutes: 5 });

    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ loginCodeExpiryMinutes: 2, isDefault: true, revision: 0, updatedAt: null, updatedBy: null, limits: LIMITS });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      loginCodeExpiryMinutes: 5,
      isDefault: false,
      revision: 0,
      updatedAt: context.clock.now().toISOString(),
      updatedBy: owner.userId,
      limits: LIMITS,
    });
  });

  it('audits the change with the value before and after', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    context.adminAuditLog.entries.length = 0;

    await request(context.app).put('/admin/access-settings').set('Authorization', `Bearer ${owner.token}`).send({ revision: 0, loginCodeExpiryMinutes: 5 });

    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({
        action: 'accessSettings.update',
        resourceType: 'accessSettings',
        resourceId: 'global',
        permission: 'access.settings.manage',
        outcome: 'done',
        before: expect.objectContaining({ loginCodeExpiryMinutes: 2, isDefault: true }),
        after: expect.objectContaining({ loginCodeExpiryMinutes: 5, isDefault: false }),
      }),
    ]);
  });

  it('refuses a value outside 1–10, not whole, or without revision', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    const put = (body: object) => request(context.app).put('/admin/access-settings').set('Authorization', `Bearer ${owner.token}`).send(body);

    for (const minutes of [0, 11, 2.5]) {
      const response = await put({ revision: 0, loginCodeExpiryMinutes: minutes });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'validation_failed', fieldErrors: { loginCodeExpiryMinutes: 'Escribe un número entero de minutos entre 1 y 10' } });
    }
    expect((await put({ loginCodeExpiryMinutes: 5 })).status).toBe(400);
  });

  it('refuses a save on a revision that already changed', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    const put = (body: object) => request(context.app).put('/admin/access-settings').set('Authorization', `Bearer ${owner.token}`).send(body);
    await put({ revision: 0, loginCodeExpiryMinutes: 5 });
    await put({ revision: 0, loginCodeExpiryMinutes: 4 });

    const stale = await put({ revision: 0, loginCodeExpiryMinutes: 3 });

    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('stale_revision');
  });

  it('needs an admin session with access.settings.manage', async () => {
    const context = await buildTestApp();
    await seedRole(context, 'soporte', ['cases.read']);
    const support = await signInStaff(context, { key: 'soporte', roleId: 'soporte' });
    context.adminAuditLog.entries.length = 0;

    const anonymous = await request(context.app).get('/admin/access-settings');
    const mobile = await request(context.app).get('/admin/access-settings').set('Authorization', 'Bearer access-1');
    const read = await request(context.app).get('/admin/access-settings').set('Authorization', `Bearer ${support.token}`);
    const write = await request(context.app).put('/admin/access-settings').set('Authorization', `Bearer ${support.token}`).send({ revision: 0, loginCodeExpiryMinutes: 5 });

    expect(anonymous.status).toBe(401);
    expect(mobile.status).toBe(401);
    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(context.adminAuditLog.entries).toContainEqual(expect.objectContaining({ action: 'PUT', permission: 'access.settings.manage', outcome: 'denied' }));
  });

  it('the next code lasts what was saved', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    await request(context.app).put('/admin/access-settings').set('Authorization', `Bearer ${owner.token}`).send({ revision: 0, loginCodeExpiryMinutes: 5 });

    const sent = await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });

    expect(sent.body.expiryMinutes).toBe(5);
    expect(context.loginCodeMailer.lastCode()).toMatch(/^\d{6}$/);
    expect(context.loginCodeMailer.sent.at(-1)!.expiryMinutes).toBe(5);
  });
});
