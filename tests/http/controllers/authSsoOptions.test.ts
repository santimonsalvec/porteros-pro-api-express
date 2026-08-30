import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';

describe('GET /api/auth/sso-options', () => {
  it('returns Google for a valid platform', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/auth/sso-options?platform=mobile');

    expect(response.status).toBe(200);
    expect(response.body.providers).toEqual([
      { provider: 'google', clientId: 'mobile-client-id', scopes: ['openid', 'email', 'profile'] },
    ]);
  });

  it('rejects a missing platform', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/auth/sso-options');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_platform');
  });

  it('rejects an unrecognized platform', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/auth/sso-options?platform=desktop');

    expect(response.status).toBe(400);
  });
});
