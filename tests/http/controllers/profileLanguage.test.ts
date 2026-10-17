import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInStaff } from '../adminTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

describe('PUT /profile/language (feature 032)', () => {
  it('saves the choice and GET /auth/me returns it', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-lang-1');

    const put = await request(context.app).put('/profile/language').set('Authorization', `Bearer ${client.token}`).send({ language: 'en' });
    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${client.token}`);
    const again = await request(context.app).put('/profile/language').set('Authorization', `Bearer ${client.token}`).send({ language: 'en' });

    expect(put.status).toBe(204);
    expect(me.body.preferredLanguage).toBe('en');
    expect(again.status).toBe(204);
    expect((await context.userRepository.getById(client.userId))?.preferredLanguage).toBe('en');
  });

  it('rejects an unsupported or missing language', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-lang-2');

    const unsupported = await request(context.app).put('/profile/language').set('Authorization', `Bearer ${client.token}`).send({ language: 'fr' });
    const missing = await request(context.app).put('/profile/language').set('Authorization', `Bearer ${client.token}`).send({});

    expect([unsupported.status, unsupported.body.error]).toEqual([400, 'validation_failed']);
    expect([missing.status, missing.body.error]).toEqual([400, 'validation_failed']);
  });

  it('needs a signed-in account', async () => {
    const context = await buildTestApp();
    const response = await request(context.app).put('/profile/language').send({ language: 'en' });
    expect(response.status).toBe(401);
  });

  it('works before the profile is complete', async () => {
    const context = await buildTestApp();
    context.googleValidator.registerValidCredential('cred-new', new ExternalIdentity('google', 'sub-lang-3', 'sub-lang-3@example.com'));
    const exchange = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-new' });

    const put = await request(context.app).put('/profile/language').set('Authorization', `Bearer ${exchange.body.accessToken}`).send({ language: 'es' });
    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${exchange.body.accessToken}`);

    expect(put.status).toBe(204);
    expect(me.body.isProfileComplete).toBe(false);
    expect(me.body.preferredLanguage).toBe('es');
  });

  it('still works for a blocked account, so its screens stay readable', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-lang-4');
    const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
    await request(context.app).post(`/admin/users/${client.userId}/block`).set('Authorization', `Bearer ${owner.token}`).send({ reason: 'Prueba' });

    const put = await request(context.app).put('/profile/language').set('Authorization', `Bearer ${client.token}`).send({ language: 'en' });

    expect(put.status).toBe(204);
  });
});
