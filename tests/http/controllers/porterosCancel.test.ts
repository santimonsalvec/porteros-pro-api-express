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
) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  const completion = await request(app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Old', lastName: 'Name', countryCode: 'CO', whatsAppNumber: '300 000 0000', acceptedTerms: true });
  return completion.body.accessToken as string;
}

describe('POST /api/porteros/me/cancel', () => {
  it('discards previously saved section data, resetting to not_started', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-1');
    await request(app)
      .patch('/api/porteros/me/physical-data')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ heightCm: 185, weightKg: 78 });

    const response = await request(app).post('/api/porteros/me/cancel').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('not_started');

    const view = await request(app).get('/api/porteros/me').set('Authorization', `Bearer ${accessToken}`);
    expect(view.body.status).toBe('not_started');
    expect(view.body.heightCm).toBeNull();
  });

  it('discards uploaded document photos too, no longer retrievable afterward', async () => {
    const { app, googleValidator, imageRepository } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-2');
    await request(app)
      .post('/api/porteros/me/document-photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('sideA', tinyJpeg, 'front.jpg');
    expect(await imageRepository.getAll()).toHaveLength(1);

    await request(app).post('/api/porteros/me/cancel').set('Authorization', `Bearer ${accessToken}`);

    expect(await imageRepository.getAll()).toHaveLength(0);
  });

  it('is a graceful no-op when nothing was ever saved', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-3');

    const response = await request(app).post('/api/porteros/me/cancel').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('not_started');
  });

  it('rejects cancellation of an already-active profile', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-4');
    await request(app)
      .patch('/api/porteros/me/identification')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ documentType: 'cedula_ciudadania', documentNumber: '123', issueDate: '2013-07-02', birthDate: '1995-03-14' });
    await request(app)
      .patch('/api/porteros/me/physical-data')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ heightCm: 185, weightKg: 78 });
    await request(app)
      .patch('/api/porteros/me/location')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ latitude: 6.2, longitude: -75.5, city: 'Medellín', state: 'Antioquia', country: 'CO' });
    await request(app)
      .patch('/api/porteros/me/availability')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ radiusKm: 25 });
    await request(app)
      .post('/api/porteros/me/document-photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('sideA', tinyJpeg, 'front.jpg')
      .attach('sideB', tinyJpeg, 'back.jpg');
    await request(app).post('/api/porteros/me/activate').set('Authorization', `Bearer ${accessToken}`);

    const response = await request(app).post('/api/porteros/me/cancel').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('already_active');
  });

  it('rejects requests with no token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/porteros/me/cancel');

    expect(response.status).toBe(401);
  });
});
