import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

async function signInAndComplete(
  app: ReturnType<typeof buildTestApp>['app'],
  googleValidator: ReturnType<typeof buildTestApp>['googleValidator'],
  credential: string,
  sub: string,
  whatsAppNumber = '300 000 0000',
) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  const completion = await request(app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Old', lastName: 'Name', countryCode: 'CO', whatsAppNumber, acceptedTerms: true });
  return completion.body.accessToken as string;
}

describe('PATCH /api/porteros/me/* section endpoints', () => {
  it('saves the physical-data section and reflects it on a later GET', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app)
      .patch('/api/porteros/me/physical-data')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ heightCm: 185, weightKg: 78 });

    expect(response.status).toBe(200);
    expect(response.body.sections.physicalData.complete).toBe(true);

    const view = await request(app).get('/api/porteros/me').set('Authorization', `Bearer ${accessToken}`);
    expect(view.body.heightCm).toBe(185);
    expect(view.body.sections.identification.complete).toBe(false);
  });

  it('saves the location section, treating neighborhood as optional', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app)
      .patch('/api/porteros/me/location')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ latitude: 6.244, longitude: -75.581, city: 'Medellín', state: 'Antioquia', country: 'CO' });

    expect(response.status).toBe(200);
    expect(response.body.sections.location.complete).toBe(true);
  });

  it('saves the availability section', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-3');

    const response = await request(app)
      .patch('/api/porteros/me/availability')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ radiusKm: 25 });

    expect(response.status).toBe(200);
    expect(response.body.radiusKm).toBe(25);
  });

  it('saves the identification section text fields, incomplete without photos', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-4');

    const response = await request(app)
      .patch('/api/porteros/me/identification')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ documentType: 'cedula_ciudadania', documentNumber: '1045678901', issueDate: '2013-07-02', birthDate: '1995-03-14' });

    expect(response.status).toBe(200);
    expect(response.body.sections.identification.complete).toBe(false);
    expect(response.body.documentNumber).toBe('1045678901');
  });

  it('rejects an unrecognized document type with 400', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-5');

    const response = await request(app)
      .patch('/api/porteros/me/identification')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ documentType: 'not_a_real_type' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_document_type');
  });

  it('rejects a duplicate document with 409', async () => {
    const { app, googleValidator } = buildTestApp();
    const tokenA = await signInAndComplete(app, googleValidator, 'token-a', 'sub-a', '300 111 1111');
    const tokenB = await signInAndComplete(app, googleValidator, 'token-b', 'sub-b', '300 222 2222');
    await request(app)
      .patch('/api/porteros/me/identification')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ documentType: 'cedula_ciudadania', documentNumber: '777' });

    const response = await request(app)
      .patch('/api/porteros/me/identification')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ documentType: 'cedula_ciudadania', documentNumber: '777' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('duplicate_document');
  });

  it('rejects an out-of-range field with 400 validation_failed', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-6');

    const response = await request(app)
      .patch('/api/porteros/me/availability')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ radiusKm: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(response.body.fieldErrors.radiusKm).toBeTruthy();
  });

  it('rejects requests with no token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).patch('/api/porteros/me/availability').send({ radiusKm: 25 });

    expect(response.status).toBe(401);
  });
});
