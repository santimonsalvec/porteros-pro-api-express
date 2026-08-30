import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));

async function signInMobile(app: ReturnType<typeof buildTestApp>['app'], googleValidator: ReturnType<typeof buildTestApp>['googleValidator'], credential: string, sub: string) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const response = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  return response.body.accessToken as string;
}

describe('POST /api/images', () => {
  it('stores an optimized image and returns its reference', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app)
      .post('/api/images')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('image', tinyJpeg, 'photo.jpg');

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ format: 'jpg', width: 800, height: 600 });
    expect(response.body.id).toBeTruthy();
    expect(response.body.url).toBeTruthy();
  });

  it('rejects a request with no file', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).post('/api/images').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_image');
  });

  it('rejects a file whose content is not actually an image, regardless of its name', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-3');

    const response = await request(app)
      .post('/api/images')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('image', Buffer.from('this is not an image'), 'photo.jpg');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_image');
  });

  it('rejects a file larger than the configured maximum', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-4');
    const oversized = Buffer.alloc(11 * 1024 * 1024, 0);

    const response = await request(app)
      .post('/api/images')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('image', oversized, 'huge.jpg');

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('file_too_large');
  });

  it('returns 502 when the storage provider fails', async () => {
    const { app, googleValidator, imageStorageProvider } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-5');
    imageStorageProvider.uploadError = new Error('Cloudinary is down');

    const response = await request(app)
      .post('/api/images')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('image', tinyJpeg, 'photo.jpg');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('storage_unavailable');
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/api/images').attach('image', tinyJpeg, 'photo.jpg');

    expect(response.status).toBe(401);
  });
});
