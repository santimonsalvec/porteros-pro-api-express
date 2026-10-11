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

describe('GET /zones', () => {
  it('returns a city\'s active zones', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app).get('/zones?cityId=city-medellin').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.zones.map((z: { id: string }) => z.id)).toEqual(['zone-bello', 'zone-copacabana']);
  });

  it('resolves a satellite city to its anchor\'s zones', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).get('/zones?cityId=city-envigado').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.zones.map((z: { id: string }) => z.id)).toEqual(['zone-bello', 'zone-copacabana']);
  });

  it('returns 404 city_not_found for an unknown cityId', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-3');

    const response = await request(app).get('/zones?cityId=does-not-exist').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('city_not_found');
  });

  it('returns 404 no_zones_configured for a city with no active zones', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-4');

    const response = await request(app).get('/zones?cityId=city-bogota').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('no_zones_configured');
  });

  it('rejects requests with no token', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/zones?cityId=city-medellin');

    expect(response.status).toBe(401);
  });

  it('shows a zone the admin created, and stops showing it once deactivated (admin spec 003)', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    const accessToken = await signIn(context.app, context.googleValidator, 'good-token', 'sub-9');
    const zones = () => request(context.app).get('/zones?cityId=city-bogota').set('Authorization', `Bearer ${accessToken}`);
    const ring = [[-74.1, 4.6], [-74.08, 4.6], [-74.08, 4.62], [-74.1, 4.62], [-74.1, 4.6]];

    const before = await zones();
    const created = await editor.post('/admin/zones', {
      cityId: 'city-bogota', name: 'Chapinero', slug: 'chapinero', geometry: { type: 'Polygon', coordinates: [ring] }, active: true, displayOrder: 1,
    });
    const opened = await zones();
    await editor.patch(`/admin/zones/${created.body.id}`, { revision: 0, active: false, reason: 'Prueba' });
    const closed = await zones();

    expect([before.status, before.body.error]).toEqual([404, 'no_zones_configured']);
    expect(opened.body.zones.map((z: { name: string }) => z.name)).toEqual(['Chapinero']);
    expect(Object.keys(opened.body.zones[0])).not.toContain('revision');
    expect([closed.status, closed.body.error]).toEqual([404, 'no_zones_configured']);
  });
});
