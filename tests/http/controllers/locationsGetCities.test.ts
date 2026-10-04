import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

async function signIn(
  app: Awaited<ReturnType<typeof buildTestApp>>['app'],
  googleValidator: Awaited<ReturnType<typeof buildTestApp>>['googleValidator'],
  credential: string,
  sub: string,
) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  return exchange.body.accessToken as string;
}

describe('GET /locations/cities', () => {
  it('returns matching cities with hasZones, without requiring a complete profile', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app).get('/locations/cities?q=medel').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cities).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Medellín', region: 'Antioquia', hasZones: true })]),
    );
  });

  it('lists the cities with active zones for an empty q', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).get('/locations/cities?q=').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cities.length).toBeGreaterThan(0);
    expect(response.body.cities.every((city: { hasZones: boolean }) => city.hasZones)).toBe(true);
  });

  it('rejects requests with no token', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/locations/cities?q=medel');

    expect(response.status).toBe(401);
  });
});
