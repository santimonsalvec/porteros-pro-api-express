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

describe('GET /locations/cities (billing municipalities, spec 031 §A3)', () => {
  it('finds municipalities with official codes and their department, without requiring a complete profile', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app).get('/locations/cities?q=medel').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cities).toEqual([{ id: 'city-medellin', name: 'Medellín', stateName: 'Antioquia' }]);
  });

  it('answers nothing for an empty q', async () => {
    const { app, googleValidator } = await buildTestApp();
    const accessToken = await signIn(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).get('/locations/cities?q=').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cities).toEqual([]);
  });

  it('rejects requests with no token', async () => {
    const { app } = await buildTestApp();

    const response = await request(app).get('/locations/cities?q=medel');

    expect(response.status).toBe(401);
  });

  it('shows a municipality the admin created once it has its codes (admin spec 003)', async () => {
    const context = await buildTestApp();
    const { editor } = await geographyStaff(context);
    const accessToken = await signIn(context.app, context.googleValidator, 'good-token', 'sub-3');
    const search = (q: string) => request(context.app).get(`/locations/cities?q=${q}`).set('Authorization', `Bearer ${accessToken}`);

    const created = await editor.post('/admin/cities', { name: 'Sabaneta', regionId: 'region-antioquia' });
    const withoutCodes = await search('sabane');
    await editor.patch(`/admin/cities/${created.body.id}`, { revision: 0, daneStateCode: '05', daneCityCode: '05631' });
    const withCodes = await search('sabane');

    expect(withoutCodes.body.cities).toEqual([]);
    expect(withCodes.body.cities).toEqual([{ id: created.body.id, name: 'Sabaneta', stateName: 'Antioquia' }]);
  });
});
