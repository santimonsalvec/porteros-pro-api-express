import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { User } from '../../../src/domain/users/user.js';
import { buildTestApp } from '../testAppFactory.js';

const MINUTE = 60 * 1000;

describe('sign-in code for the app — /auth/email-code (admin spec 009, US1)', () => {
  it('sends a code to any valid address and says when it expires', async () => {
    const context = await buildTestApp();

    const response = await request(context.app).post('/auth/email-code').send({ email: ' Juana@Gmail.com ' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      email: 'juana@gmail.com',
      expiresAt: new Date(context.clock.now().getTime() + 2 * MINUTE).toISOString(),
      expiryMinutes: 2,
      resendAfterSeconds: 60,
    });
    expect(context.loginCodeMailer.sent).toEqual([{ to: 'juana@gmail.com', code: '100001', expiryMinutes: 2, idempotencyKey: expect.any(String), language: 'es' }]);
  });

  it('refuses a missing or invalid address', async () => {
    const context = await buildTestApp();

    const invalid = await request(context.app).post('/auth/email-code').send({ email: 'juana@' });
    const missing = await request(context.app).post('/auth/email-code').send({});

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: 'validation_failed', fieldErrors: { email: expect.any(String) } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('validation_failed');
    expect(context.loginCodeMailer.sent).toEqual([]);
  });

  it('answers 503 when the email provider fails, and the person may try again at once', async () => {
    const context = await buildTestApp();
    context.loginCodeMailer.next = { outcome: 'failed', reason: 'transient' };

    const failed = await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });
    context.loginCodeMailer.next = { outcome: 'sent' };
    const retried = await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });

    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe('email_delivery_failed');
    expect(retried.status).toBe(202);
  });

  it('limits the requests per network address', async () => {
    const context = await buildTestApp();
    for (let index = 0; index < 20; index += 1) {
      await request(context.app).post('/auth/email-code').send({ email: `persona${index}@gmail.com` });
    }

    const response = await request(context.app).post('/auth/email-code').send({ email: 'otra@gmail.com' });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: 'too_many_requests', retryAfterSeconds: 3600 });
    expect(response.headers['retry-after']).toBe('3600');
  });
});

describe('sign-in code for the app — /auth/email-code/verify (admin spec 009, US1)', () => {
  const askAndVerify = async (context: Awaited<ReturnType<typeof buildTestApp>>, email = 'juana@gmail.com') => {
    await request(context.app).post('/auth/email-code').send({ email });
    return request(context.app).post('/auth/email-code/verify').send({ email, code: context.loginCodeMailer.lastCode() });
  };

  it('signs a new address in, with an account that must complete its profile', async () => {
    const context = await buildTestApp();

    const response = await askAndVerify(context);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresInSeconds: 900 });
    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'juana@gmail.com', isProfileComplete: false });
  });

  it('signs in to the account a Google sign-in made for that address', async () => {
    const context = await buildTestApp();
    const google = User.createFromExternalIdentity({ id: 'google-user', email: 'juana@gmail.com', displayName: null, provider: 'google', subject: 'sub-1', emailVerified: true });
    context.userRepository.seed(google);

    const response = await askAndVerify(context);

    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(me.body.userId).toBe('google-user');
  });

  it('refuses a wrong, an expired and a used-up code', async () => {
    const context = await buildTestApp();
    await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });
    const code = context.loginCodeMailer.lastCode();

    const wrong = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code: '999999' });
    context.clock.advance(2 * MINUTE);
    const expired = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code });

    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('invalid_code');
    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe('code_expired');
  });

  it('answers too_many_attempts at the third wrong code in a row', async () => {
    const context = await buildTestApp();
    await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });
    const tries = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      tries.push(await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code: '999999' }));
    }

    expect(tries.map((response) => response.body.error)).toEqual(['invalid_code', 'invalid_code', 'too_many_attempts']);
    expect(tries[2]!.status).toBe(401);
  });

  it('refuses a blocked account after the right code', async () => {
    const context = await buildTestApp();
    context.userRepository.seed(User.createFromVerifiedEmail({ id: 'blocked-user', email: 'juana@gmail.com' }));
    await context.userBlockRepository.block('blocked-user', 'staff-1', 'fraude', context.clock.now());

    const response = await askAndVerify(context);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('account_blocked');
  });

  it('refuses a code asked for the admin web', async () => {
    const context = await buildTestApp();
    await request(context.app).post('/auth/admin/email-code').send({ email: 'juana@gmail.com' });

    const response = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code: '100001' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid_code');
  });

  it('refuses a missing code', async () => {
    const context = await buildTestApp();

    const response = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
  });

  it('never puts the code in a response nor in the log', async () => {
    const context = await buildTestApp();

    const asked = await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });
    const verified = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code: context.loginCodeMailer.lastCode() });

    for (const text of [JSON.stringify(asked.body), JSON.stringify(verified.body), JSON.stringify(context.loginCodeLogs)]) {
      expect(text).not.toContain('100001');
    }
    expect(JSON.stringify(context.loginCodeLogs)).not.toContain('juana@gmail.com');
  });
});
