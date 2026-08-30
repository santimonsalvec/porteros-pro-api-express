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

describe('DELETE /api/images/:id', () => {
  it('deletes a stored image and makes it unreachable afterward', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-1');
    const upload = await request(app).post('/api/images').set('Authorization', `Bearer ${accessToken}`).attach('image', tinyJpeg, 'photo.jpg');

    const response = await request(app).delete(`/api/images/${upload.body.id}`).set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(204);
    const followUp = await request(app).get(`/api/images/${upload.body.id}`).set('Authorization', `Bearer ${accessToken}`);
    expect(followUp.status).toBe(404);
  });

  it('returns 404 for an unknown or already-deleted id', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).delete('/api/images/does-not-exist').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('image_not_found');
  });

  it('returns 403 for a different authenticated user', async () => {
    const { app, googleValidator } = buildTestApp();
    const ownerToken = await signInMobile(app, googleValidator, 'owner-token', 'sub-owner');
    const otherToken = await signInMobile(app, googleValidator, 'other-token', 'sub-other');
    const upload = await request(app).post('/api/images').set('Authorization', `Bearer ${ownerToken}`).attach('image', tinyJpeg, 'photo.jpg');

    const response = await request(app).delete(`/api/images/${upload.body.id}`).set('Authorization', `Bearer ${otherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('forbidden');
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = buildTestApp();

    const response = await request(app).delete('/api/images/some-id');

    expect(response.status).toBe(401);
  });
});
