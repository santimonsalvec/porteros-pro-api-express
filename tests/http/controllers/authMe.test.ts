import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

describe('GET /auth/me preferredLanguage (feature 032)', () => {
  it('is null until the person chooses a language', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-me-1');

    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${client.token}`);

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ userId: client.userId, isProfileComplete: true, preferredLanguage: null });
  });

  it('returns the stored choice', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-me-2');
    const user = (await context.userRepository.getById(client.userId))!;
    user.preferredLanguage = 'en';
    await context.userRepository.update(user);

    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${client.token}`);

    expect(me.body.preferredLanguage).toBe('en');
  });
});
