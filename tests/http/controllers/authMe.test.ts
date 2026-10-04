import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

describe('GET /auth/me', () => {
  it('returns claims for a valid access token', async () => {
    const { app, googleValidator } = await buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'a@example.com'));
    const exchange = await request(app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'good-token' });

    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${exchange.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('a@example.com');
    expect(response.body.isAdmin).toBe(false);
    expect(response.body.isProfileComplete).toBe(false);
  });

  it('rejects a missing token', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/auth/me').set('Authorization', 'Bearer garbage');

    expect(response.status).toBe(401);
  });
});
