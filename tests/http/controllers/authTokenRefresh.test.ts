import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

describe('POST /auth/tokens/refresh', () => {
  it('issues a new pair for a valid refresh token', async () => {
    const { app, googleValidator } = await buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'a@example.com'));
    const exchange = await request(app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'good-token' });

    const response = await request(app)
      .post('/auth/tokens/refresh')
      .send({ refreshToken: exchange.body.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
  });

  it('rejects an unrecognized refresh token', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).post('/auth/tokens/refresh').send({ refreshToken: 'never-issued' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('invalid_refresh_token');
  });

  it('rejects a refresh token that has already been used', async () => {
    const { app, googleValidator } = await buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-1', 'a@example.com'));
    const exchange = await request(app)
      .post('/auth/sso/exchange')
      .send({ provider: 'google', platform: 'mobile', credential: 'good-token' });
    await request(app).post('/auth/tokens/refresh').send({ refreshToken: exchange.body.refreshToken });

    const secondAttempt = await request(app)
      .post('/auth/tokens/refresh')
      .send({ refreshToken: exchange.body.refreshToken });

    expect(secondAttempt.status).toBe(401);
  });
});
