import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { User } from '../../../src/domain/users/user.js';

describe('POST /api/auth/sso/exchange', () => {
  it('issues a session for a new mobile account', async () => {
    const { app, googleValidator } = buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'a@example.com'));

    const response = await request(app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'good-token' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
  });

  it('rejects an invalid credential', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'bad-token' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid_credential');
  });

  it('rejects admin-web login with no matching admin account', async () => {
    const { app, googleValidator } = buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-2', 'b@example.com'));

    const response = await request(app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'admin-web', credential: 'good-token' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('unauthorized_admin_account');
  });

  it('succeeds for an existing admin-web account', async () => {
    const { app, googleValidator, userRepository } = buildTestApp();
    const admin = User.createFromExternalIdentity({
      id: 'admin-1',
      email: 'admin@example.com',
      displayName: null,
      provider: 'google',
      subject: 'admin-sub',
      isAdmin: true,
    });
    await userRepository.add(admin);
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'admin-sub', 'admin@example.com'));

    const response = await request(app)
      .post('/api/auth/sso/exchange')
      .send({ provider: 'google', platform: 'admin-web', credential: 'good-token' });

    expect(response.status).toBe(200);
  });

  it('rejects a malformed request body', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google' });

    expect(response.status).toBe(400);
  });
});
