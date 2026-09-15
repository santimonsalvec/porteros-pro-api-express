import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

async function signIn(
  app: ReturnType<typeof buildTestApp>['app'],
  googleValidator: ReturnType<typeof buildTestApp>['googleValidator'],
  credential: string,
  sub: string,
) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  return exchange.body.accessToken as string;
}

describe('GET /api/locations/cities', () => {
  it('returns matching cities with hasZones, without requiring a complete profile', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app).get('/api/locations/cities?q=medel').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cities).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Medellín', region: 'Antioquia', hasZones: true })]),
    );
  });

  it('returns an empty list for an empty q', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).get('/api/locations/cities?q=').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cities).toEqual([]);
  });

  it('rejects requests with no token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/locations/cities?q=medel');

    expect(response.status).toBe(401);
  });
});
