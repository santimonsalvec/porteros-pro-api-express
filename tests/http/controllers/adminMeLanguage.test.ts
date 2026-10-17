import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { CSRF, signInStaff } from '../adminTestHelpers.js';

describe('the admin member\'s language — /admin/me (feature 032, US4)', () => {
  it('reads the linked user\'s language, null until chosen, and saves a new one', async () => {
    const context = await buildTestApp();
    const staff = await signInStaff(context, { key: 'dueno' });
    const auth = { Authorization: `Bearer ${staff.token}` };

    const before = await request(context.app).get('/admin/me').set(auth);
    const saved = await request(context.app).put('/admin/me/language').set(auth).set(CSRF).send({ language: 'en' });
    const after = await request(context.app).get('/admin/me').set(auth);
    const again = await request(context.app).put('/admin/me/language').set(auth).set(CSRF).send({ language: 'en' });

    expect(before.body.preferredLanguage).toBeNull();
    expect(saved.status).toBe(204);
    expect(after.body.preferredLanguage).toBe('en');
    expect((await context.userRepository.getById(staff.userId))?.preferredLanguage).toBe('en');
    expect(again.status).toBe(204);
  });

  it('refuses an unsupported language, a missing session and a missing CSRF header', async () => {
    const context = await buildTestApp();
    const staff = await signInStaff(context, { key: 'dueno' });
    const auth = { Authorization: `Bearer ${staff.token}` };

    const unsupported = await request(context.app).put('/admin/me/language').set(auth).set(CSRF).send({ language: 'fr' });
    const noSession = await request(context.app).put('/admin/me/language').set(CSRF).send({ language: 'en' });
    const noCsrf = await request(context.app).put('/admin/me/language').set(auth).send({ language: 'en' });

    expect(unsupported.status).toBe(400);
    expect(unsupported.body.error).toBe('validation_failed');
    expect(noSession.status).toBe(401);
    expect(noCsrf.status).toBe(400);
    expect(noCsrf.body.error).toBe('missing_csrf_header');
    expect((await context.userRepository.getById(staff.userId))?.preferredLanguage).toBeNull();
  });
});
