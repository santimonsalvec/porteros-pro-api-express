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

describe('GET /api/zones', () => {
  it('returns a city\'s active zones', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app).get('/api/zones?cityId=city-medellin').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.zones.map((z: { id: string }) => z.id)).toEqual(['zone-bello', 'zone-copacabana']);
  });

  it('resolves a satellite city to its anchor\'s zones', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).get('/api/zones?cityId=city-envigado').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.zones.map((z: { id: string }) => z.id)).toEqual(['zone-bello', 'zone-copacabana']);
  });

  it('returns 404 city_not_found for an unknown cityId', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-3');

    const response = await request(app).get('/api/zones?cityId=does-not-exist').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('city_not_found');
  });

  it('returns 404 no_zones_configured for a city with no active zones', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-4');

    const response = await request(app).get('/api/zones?cityId=city-bogota').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('no_zones_configured');
  });

  it('rejects requests with no token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/zones?cityId=city-medellin');

    expect(response.status).toBe(401);
  });
});
