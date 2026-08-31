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
    .send({ firstName: 'Old', lastName: 'Name', countryCode: 'CO', whatsAppNumber: `300 000 ${sub.slice(-4).padStart(4, '0')}`, acceptedTerms: true });
  return completion.body.accessToken as string;
}

describe('POST /api/porteros/me/document-photo', () => {
  it('uploads sideA, marking documentPhotoASubmitted true and sideB false', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app)
      .post('/api/porteros/me/document-photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('sideA', tinyJpeg, 'front.jpg');

    expect(response.status).toBe(200);
    expect(response.body.documentPhotoASubmitted).toBe(true);
    expect(response.body.documentPhotoBSubmitted).toBe(false);
  });

  it('uploads both sides in one request', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app)
      .post('/api/porteros/me/document-photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('sideA', tinyJpeg, 'front.jpg')
      .attach('sideB', tinyJpeg, 'back.jpg');

    expect(response.status).toBe(200);
    expect(response.body.documentPhotoASubmitted).toBe(true);
    expect(response.body.documentPhotoBSubmitted).toBe(true);
  });

  it('replaces a previously uploaded photo for the same side', async () => {
    const { app, googleValidator, imageRepository } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-3');
    await request(app).post('/api/porteros/me/document-photo').set('Authorization', `Bearer ${accessToken}`).attach('sideA', tinyJpeg, 'first.jpg');
    const firstImages = await imageRepository.getAll();
    expect(firstImages).toHaveLength(1);

    await request(app).post('/api/porteros/me/document-photo').set('Authorization', `Bearer ${accessToken}`).attach('sideA', tinyJpeg, 'second.jpg');

    const remainingImages = await imageRepository.getAll();
    expect(remainingImages).toHaveLength(1);
    expect(remainingImages[0]?.id).not.toBe(firstImages[0]?.id);
  });

  it('rejects a request with no file', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-4');

    const response = await request(app).post('/api/porteros/me/document-photo').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_image');
  });

  it('rejects non-image content', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-5');

    const response = await request(app)
      .post('/api/porteros/me/document-photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('sideA', Buffer.from('not an image'), 'front.jpg');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_image');
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/porteros/me/document-photo').attach('sideA', tinyJpeg, 'front.jpg');

    expect(response.status).toBe(401);
  });
});
