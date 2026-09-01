import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));

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

async function completeAllSections(app: ReturnType<typeof buildTestApp>['app'], accessToken: string) {
  await request(app)
    .patch('/api/porteros/me/identification')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ documentType: 'cedula_ciudadania', documentNumber: `doc-${accessToken.slice(0, 8)}`, issueDate: '2013-07-02', birthDate: '1995-03-14' });
  await request(app)
    .patch('/api/porteros/me/physical-data')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ heightCm: 185, weightKg: 78 });
  await request(app)
    .patch('/api/porteros/me/location')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ latitude: 6.244, longitude: -75.581, city: 'Medellín', state: 'Antioquia', country: 'CO' });
  await request(app)
    .patch('/api/porteros/me/availability')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ radiusKm: 25 });
  await request(app)
    .post('/api/porteros/me/document-photo')
    .set('Authorization', `Bearer ${accessToken}`)
    .attach('sideA', tinyJpeg, 'front.jpg')
    .attach('sideB', tinyJpeg, 'back.jpg');
}

describe('POST /api/porteros/me/activate', () => {
  it('activates once all four sections are complete', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-1');
    await completeAllSections(app, accessToken);

    const response = await request(app).post('/api/porteros/me/activate').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('active');

    const view = await request(app).get('/api/porteros/me').set('Authorization', `Bearer ${accessToken}`);
    expect(view.body.status).toBe('active');
  });

  it('rejects activation with a missing section, naming it', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-2');
    await request(app)
      .patch('/api/porteros/me/physical-data')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ heightCm: 185, weightKg: 78 });

    const response = await request(app).post('/api/porteros/me/activate').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('portero_profile_incomplete');
    expect(response.body.missingSections).toContain('availability');
    expect(response.body.missingSections).not.toContain('physicalData');
  });

  it('rejects a second activation attempt', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-3');
    await completeAllSections(app, accessToken);
    await request(app).post('/api/porteros/me/activate').set('Authorization', `Bearer ${accessToken}`);

    const response = await request(app).post('/api/porteros/me/activate').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('already_active');
  });
});
