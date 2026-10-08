import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_ADMIN_ORIGIN } from '../testAppFactory.js';
import { CSRF, refreshCookieOf, signInStaff } from '../adminTestHelpers.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

const MINUTE = 60 * 1000;

describe('admin web session — /auth/admin (spec 001, US1)', () => {
  it('signs in a staff member: the refresh value only travels in a restricted cookie', async () => {
    const context = await buildTestApp();
    await signInStaff(context, { key: 'dueno' });
    context.googleValidator.registerValidAdminCredential('again', new ExternalIdentity('google', 'sub-dueno', 'dueno@porteros.pro'));

    const response = await request(context.app).post('/auth/admin/sign-in').set('User-Agent', 'Firefox').send({ credential: 'again' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      expiresInSeconds: 300,
      session: { startedAt: context.clock.now().toISOString(), absoluteExpiresAt: expect.any(String) },
    });
    const setCookie = (response.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/^pp_admin_rt=[^;]+; Path=\/auth\/admin; HttpOnly; SameSite=Strict; Secure$/);
  });

  it('refuses whoever is not a staff member, and a malformed body', async () => {
    const context = await buildTestApp();
    context.googleValidator.registerValidAdminCredential('stranger', new ExternalIdentity('google', 'sub-x', 'x@example.com'));

    const stranger = await request(context.app).post('/auth/admin/sign-in').send({ credential: 'stranger' });
    const forged = await request(context.app).post('/auth/admin/sign-in').send({ credential: 'forged' });
    const empty = await request(context.app).post('/auth/admin/sign-in').send({});

    expect(stranger.status).toBe(403);
    expect(stranger.body.error).toBe('unauthorized_admin_account');
    expect(stranger.headers['set-cookie']).toBeUndefined();
    expect(forged.status).toBe(401);
    expect(forged.body.error).toBe('invalid_credential');
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('validation_failed');
  });

  it('refresh needs the CSRF header, rotates the cookie and refuses the old one afterwards', async () => {
    const context = await buildTestApp();
    const staff = await signInStaff(context, { key: 'dueno' });

    const withoutHeader = await request(context.app).post('/auth/admin/refresh').set('Cookie', staff.cookie);
    const refreshed = await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', staff.cookie);
    const reused = await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', staff.cookie);
    const afterReuse = await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', refreshCookieOf(refreshed)!);

    expect(withoutHeader.status).toBe(400);
    expect(withoutHeader.body.error).toBe('missing_csrf_header');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookieOf(refreshed)).not.toBe(staff.cookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error).toBe('invalid_refresh_token');
    expect(reused.headers['set-cookie']).toEqual([expect.stringContaining('Max-Age=0')]);
    expect(afterReuse.status).toBe(401);
  });

  it('refresh without a cookie is a 401', async () => {
    const context = await buildTestApp();

    const response = await request(context.app).post('/auth/admin/refresh').set(CSRF);

    expect(response.status).toBe(401);
  });

  it('ends the session after 30 minutes without use', async () => {
    const context = await buildTestApp();
    const staff = await signInStaff(context, { key: 'dueno' });

    context.clock.advance(31 * MINUTE);

    expect((await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', staff.cookie)).status).toBe(401);
  });

  it('ends the session after 12 hours even when refreshed every 5 minutes', async () => {
    const context = await buildTestApp();
    let cookie = (await signInStaff(context, { key: 'dueno' })).cookie;

    for (let minutes = 5; minutes < 12 * 60; minutes += 5) {
      context.clock.advance(5 * MINUTE);
      const response = await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', cookie);
      expect(response.status).toBe(200);
      cookie = refreshCookieOf(response)!;
    }
    context.clock.advance(5 * MINUTE);

    expect((await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', cookie)).status).toBe(401);
  });

  it('signs out: 204, the cookie is cleared and the session no longer refreshes', async () => {
    const context = await buildTestApp();
    const staff = await signInStaff(context, { key: 'dueno' });

    const signOut = await request(context.app).post('/auth/admin/sign-out').set(CSRF).set('Cookie', staff.cookie);
    const refresh = await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', staff.cookie);

    expect(signOut.status).toBe(204);
    expect(signOut.headers['set-cookie']).toEqual([expect.stringContaining('Max-Age=0')]);
    expect(refresh.status).toBe(401);
  });

  it('answers the admin origin preflight with credentials, and no other origin', async () => {
    const context = await buildTestApp();

    const allowed = await request(context.app)
      .options('/auth/admin/refresh')
      .set('Origin', TEST_ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    const other = await request(context.app)
      .options('/auth/admin/refresh')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(TEST_ADMIN_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /auth/admin/sso-options', () => {
  it("gives the admin web its Google client, readable from the admin's origin", async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/auth/admin/sso-options').set('Origin', TEST_ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(TEST_ADMIN_ORIGIN);
    expect(response.body).toEqual({ providers: [{ provider: 'google', clientId: 'web-client-id', scopes: ['openid', 'email', 'profile'] }] });
  });

  it("leaves the app's /auth/sso-options without CORS, as before", async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/auth/sso-options?platform=admin-web').set('Origin', TEST_ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
