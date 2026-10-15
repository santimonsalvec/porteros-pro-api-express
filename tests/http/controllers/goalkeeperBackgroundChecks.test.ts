import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInClient, signInGoalkeeper } from '../operatingBalanceTestHelpers.js';
import { BackgroundCheck } from '../../../src/domain/goalkeepers/backgroundCheck.js';

const tinyJpeg = readFileSync(fileURLToPath(new URL('../../fixtures/tinyImage.jpg', import.meta.url)));

describe('goalkeeper background checks (admin spec 030, contracts A2–A4)', () => {
  it('uploads a check, lists it and deletes it while pending', async () => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-3001');

    const created = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`).attach('file', tinyJpeg, 'cert.jpg');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: expect.any(String), url: expect.any(String), status: 'pending', expiresAt: null, expired: false });

    const listed = await request(context.app).get('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([created.body]);

    const deleted = await request(context.app).delete(`/goalkeepers/me/background-checks/${created.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(204);
    expect(context.backgroundCheckRepository.all()).toHaveLength(0);
  });

  it('refuses what is not an image, and a request without file', async () => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-3002');

    const notImage = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`).attach('file', Buffer.from('not an image'), 'cert.jpg');
    expect(notImage.status).toBe(400);
    expect(notImage.body.error).toBe('invalid_image');

    const noFile = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`);
    expect(noFile.status).toBe(400);
    expect(noFile.body.error).toBe('invalid_image');
  });

  it('refuses a sixth check', async () => {
    const context = await buildTestApp();
    const { token, userId } = await signInGoalkeeper(context, 'sub-3003');
    for (let n = 1; n <= 5; n++) context.backgroundCheckRepository.seed(BackgroundCheck.upload(`bc-${n}`, userId, `img-${n}`, new Date()));

    const response = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`).attach('file', tinyJpeg, 'cert.jpg');

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('background_check_limit');
  });

  it('reports the storage being down', async () => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-3004');
    context.imageStorageProvider.uploadError = new Error('down');

    const response = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`).attach('file', tinyJpeg, 'cert.jpg');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('storage_unavailable');
  });

  it('keeps a reviewed check and hides other goalkeepers\' checks', async () => {
    const context = await buildTestApp();
    const { token, userId } = await signInGoalkeeper(context, 'sub-3005');
    context.backgroundCheckRepository.seed(BackgroundCheck.upload('reviewed', userId, 'img-1', new Date()).approve('staff-1', new Date()));
    context.backgroundCheckRepository.seed(BackgroundCheck.upload('someone-else', 'other-gk', 'img-2', new Date()));

    const reviewed = await request(context.app).delete('/goalkeepers/me/background-checks/reviewed').set('Authorization', `Bearer ${token}`);
    expect(reviewed.status).toBe(409);
    expect(reviewed.body.error).toBe('background_check_reviewed');

    const foreign = await request(context.app).delete('/goalkeepers/me/background-checks/someone-else').set('Authorization', `Bearer ${token}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe('background_check_not_found');
  });

  it('is only for active goalkeepers', async () => {
    const context = await buildTestApp();
    const { token } = await signInClient(context, 'sub-3006');

    const response = await request(context.app).get('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`);
    const upload = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`).attach('file', tinyJpeg, 'cert.jpg');

    expect(response.status).toBe(404);
    expect(upload.status).toBe(404);
  });

  it('refuses a file over the size limit', async () => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-3008');

    const response = await request(context.app).post('/goalkeepers/me/background-checks').set('Authorization', `Bearer ${token}`).attach('file', Buffer.alloc(11 * 1024 * 1024, 0), 'cert.jpg');

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('file_too_large');
  });
});

describe('GET /goalkeepers/me — vetting (contracts A1)', () => {
  it('tells an active goalkeeper they are pending validation', async () => {
    const context = await buildTestApp();
    const { token, userId } = await signInClient(context, 'sub-3007');
    const { buildGoalkeeperProfile } = await import('../../fixtures/operatingBalanceFixtures.js');
    const { PENDING_VETTING } = await import('../../../src/domain/goalkeepers/vetting.js');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(userId, { vetting: PENDING_VETTING }));

    const response = await request(context.app).get('/goalkeepers/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.vetting).toEqual({ tier: 'unvalidated', rejection: null, backgroundChecks: { pending: 0, approved: 0, rejected: 0, expired: 0 }, unverifiedDiscount: null });
  });
});
