import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { geographyStaff } from '../geographyTestHelpers.js';

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

  it('shows a city the admin created, and one that now uses an anchor as having zones (admin spec 003)', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    const accessToken = await signIn(context.app, context.googleValidator, 'good-token', 'sub-3');
    const search = (q: string) => request(context.app).get(`/locations/cities?q=${q}`).set('Authorization', `Bearer ${accessToken}`);

    await editor.post('/admin/cities', { name: 'Sabaneta', regionId: 'region-antioquia' });
    const created = await search('sabane');
    await editor.patch('/admin/cities/city-bogota', { revision: 0, zoneCityId: 'city-medellin' });
    const satellite = await search('bogo');

    expect(created.body.cities).toEqual([expect.objectContaining({ name: 'Sabaneta', region: 'Antioquia', hasZones: false })]);
    expect(satellite.body.cities).toEqual([expect.objectContaining({ id: 'city-bogota', hasZones: true })]);
    expect(Object.keys(satellite.body.cities[0])).not.toContain('revision');
  });
});
