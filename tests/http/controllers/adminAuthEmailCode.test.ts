import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { StaffMember } from '../../../src/domain/staff/staffMember.js';
import { OWNER_ROLE_ID } from '../../../src/domain/staff/staffRole.js';
import { User } from '../../../src/domain/users/user.js';
import { buildTestApp, TEST_ADMIN_ORIGIN } from '../testAppFactory.js';
import { CSRF, refreshCookieOf } from '../adminTestHelpers.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

async function activeMember(context: TestApp, key: string) {
  const now = context.clock.now();
  await context.staffRoleRepository.ensureOwner(now);
  const email = `${key}@porteros.pro`;
  await context.userRepository.add(User.createFromVerifiedEmail({ id: `user-${key}`, email }));
  await context.staffMemberRepository.add(StaffMember.invite({ id: `staff-${key}`, email, roleId: OWNER_ROLE_ID, invitedBy: 'system:script' }, now).activate(`user-${key}`, key, now));
  return email;
}

const ask = (context: TestApp, email: string) => request(context.app).post('/auth/admin/email-code').set('Origin', TEST_ADMIN_ORIGIN).send({ email });
const verify = (context: TestApp, email: string, code: string) =>
  request(context.app).post('/auth/admin/email-code/verify').set('Origin', TEST_ADMIN_ORIGIN).set('User-Agent', 'Firefox').send({ email, code });

describe('admin web sign-in code — /auth/admin/email-code (admin spec 009, US3)', () => {
  it('answers the same for a member and for anyone else, and only the member gets a code', async () => {
    const context = await buildTestApp();
    const email = await activeMember(context, 'ana');

    const member = await ask(context, email);
    const stranger = await ask(context, 'nadie@porteros.pro');

    expect(member.status).toBe(202);
    expect(stranger.status).toBe(202);
    expect({ ...stranger.body, email: undefined }).toEqual({ ...member.body, email: undefined });
    expect(member.headers['access-control-allow-origin']).toBe(TEST_ADMIN_ORIGIN);
    expect(context.loginCodeMailer.sent.map((sent) => sent.to)).toEqual(['ana@porteros.pro']);
  });

  it('refuses a malformed address and asks to wait between codes', async () => {
    const context = await buildTestApp();
    const email = await activeMember(context, 'ana');

    const malformed = await ask(context, 'ana@');
    await ask(context, email);
    const tooSoon = await ask(context, email);

    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('validation_failed');
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error).toBe('resend_too_soon');
  });
});

describe('admin web sign-in code — /auth/admin/email-code/verify (admin spec 009, US3)', () => {
  it('opens the same session as Google: access token in the body, refresh value in the cookie', async () => {
    const context = await buildTestApp();
    const email = await activeMember(context, 'ana');
    await ask(context, email);

    const response = await verify(context, email, context.loginCodeMailer.lastCode());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      expiresInSeconds: 300,
      session: { startedAt: context.clock.now().toISOString(), absoluteExpiresAt: expect.any(String) },
    });
    const cookie = refreshCookieOf(response);
    expect(cookie).toMatch(/^pp_admin_rt=/);
    const refreshed = await request(context.app).post('/auth/admin/refresh').set(CSRF).set('Cookie', cookie!);
    expect(refreshed.status).toBe(200);
    const me = await request(context.app).get('/admin/me').set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('refuses any code for an address without access', async () => {
    const context = await buildTestApp();
    await ask(context, 'nadie@porteros.pro');

    const response = await verify(context, 'nadie@porteros.pro', '100001');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid_code');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('activates a valid invitation', async () => {
    const context = await buildTestApp();
    await context.staffRoleRepository.ensureOwner(context.clock.now());
    await context.staffMemberRepository.add(StaffMember.invite({ id: 'staff-luis', email: 'luis@porteros.pro', roleId: OWNER_ROLE_ID, invitedBy: 'x' }, context.clock.now()));
    await ask(context, 'luis@porteros.pro');

    const response = await verify(context, 'luis@porteros.pro', context.loginCodeMailer.lastCode());

    expect(response.status).toBe(200);
    expect(await context.staffMemberRepository.getById('staff-luis')).toMatchObject({ status: 'active' });
  });

  it('keeps the sessions apart: an admin code never opens the app, nor an app code the admin', async () => {
    const context = await buildTestApp();
    const email = await activeMember(context, 'ana');
    await ask(context, email);
    const adminCode = context.loginCodeMailer.lastCode();
    const inApp = await request(context.app).post('/auth/email-code/verify').send({ email, code: adminCode });

    context.clock.advance(60 * 1000);
    await request(context.app).post('/auth/email-code').send({ email });
    const inAdmin = await verify(context, email, context.loginCodeMailer.lastCode());

    expect(inApp.body.error).toBe('invalid_code');
    expect(inAdmin.body.error).toBe('invalid_code');
  });

  it('the admin token does not work on the app routes', async () => {
    const context = await buildTestApp();
    const email = await activeMember(context, 'ana');
    await ask(context, email);
    const response = await verify(context, email, context.loginCodeMailer.lastCode());

    const appMe = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${response.body.accessToken}`);

    expect(appMe.status).toBe(401);
  });
});
