import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { User } from '../../../src/domain/users/user.js';

describe('POST /auth/sso/exchange', () => {
  it('issues a session for a new mobile account', async () => {
    const { app, googleValidator } = await buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'a@example.com'));

    const response = await request(app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'good-token' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
  });

  it('rejects an invalid credential', async () => {
    const { app } = await buildTestApp();

    const response = await request(app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'bad-token' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid_credential');
  });

  it("answers 410 to platform admin-web, even for an account flagged isAdmin (spec 001: the admin web has its own sign-in)", async () => {
    const { app, googleValidator, userRepository } = await buildTestApp();
    await userRepository.add(
      User.createFromExternalIdentity({ id: 'admin-1', email: 'admin@example.com', displayName: null, provider: 'google', subject: 'admin-sub', isAdmin: true }),
    );
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'admin-sub', 'admin@example.com'));

    const response = await request(app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'admin-web', credential: 'good-token' });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('admin_sign_in_moved');
  });

  it('rejects a malformed request body', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).post('/auth/sso/exchange').send({ provider: 'google' });

    expect(response.status).toBe(400);
  });
});
