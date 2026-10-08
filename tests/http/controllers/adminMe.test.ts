import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { CSRF, signInStaff } from '../adminTestHelpers.js';
import { signInClient } from '../walletTestHelpers.js';
import { PERMISSION_CATALOG } from '../../../src/domain/staff/permissionCatalog.js';

describe('GET /admin/me (spec 001, US1)', () => {
  it("returns the owner, the role and the whole catalog", async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });

    const response = await request(context.app).get('/admin/me').set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      staffId: owner.staffId,
      userId: owner.userId,
      email: 'dueno@porteros.pro',
      displayName: 'dueno',
      role: { id: 'owner', name: 'Dueño', system: true },
      permissions: [...PERMISSION_CATALOG],
      session: { startedAt: expect.any(String), absoluteExpiresAt: expect.any(String) },
    });
  });

  it("refuses no token and an app token with 401", async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0001');

    expect((await request(context.app).get('/admin/me')).status).toBe(401);
    expect((await request(context.app).get('/admin/me').set('Authorization', `Bearer ${client.token}`)).status).toBe(401);
  });

  it('stops answering once the session is signed out and the cache runs out', async () => {
    const context = await buildTestApp();
    const owner = await signInStaff(context, { key: 'dueno' });
    await request(context.app).post('/auth/admin/sign-out').set(CSRF).set('Cookie', owner.cookie);

    context.clock.advance(30 * 1000);

    expect((await request(context.app).get('/admin/me').set('Authorization', `Bearer ${owner.token}`)).status).toBe(401);
  });
});
