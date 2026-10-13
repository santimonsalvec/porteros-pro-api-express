import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInStaff } from '../adminTestHelpers.js';
import { signInClient, signInGoalkeeper } from '../walletTestHelpers.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

/** A goalkeeper signed in on the app with a refresh token, and an owner of the admin web. */
async function world() {
  const context = await buildTestApp();
  context.googleValidator.registerValidCredential('cred-keeper', new ExternalIdentity('google', 'sub-0001', 'sub-0001@example.com'));
  const exchange = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-keeper' });
  const keeper = await signInGoalkeeper(context, 'sub-0001');
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  const admin = (path: string, body: object) => request(context.app).post(`/admin/users/${keeper.userId}/${path}`).set('Authorization', `Bearer ${owner.token}`).send(body);
  return { context, keeper, owner, refreshToken: exchange.body.refreshToken as string, admin };
}

describe('a blocked user on the app (spec 005 of the admin, FR-027, FR-030)', () => {
  it('cannot sign in nor renew the session, and the answer never says why', async () => {
    const { context, refreshToken, admin } = await world();
    await admin('block', { reason: 'Acoso a clientes' });

    const signIn = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-keeper' });
    const renewal = await request(context.app).post('/auth/tokens/refresh').send({ refreshToken });

    for (const response of [signIn, renewal]) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('account_blocked');
      expect(JSON.stringify(response.body)).not.toContain('Acoso');
    }
  });

  it('cannot turn the offers on (but can turn them off) while blocked', async () => {
    const { context, keeper, admin } = await world();
    await admin('block', { reason: 'Acoso a clientes' });
    const put = (available: boolean) => request(context.app).put('/goalkeepers/me/offers-availability').set('Authorization', `Bearer ${keeper.token}`).send({ available });

    const on = await put(true);
    expect([on.status, on.body.error]).toEqual([403, 'account_blocked']);
    expect((await put(false)).status).toBe(200);
  });

  it('signs in and renews again once unblocked; others never noticed', async () => {
    const { context, refreshToken, admin } = await world();
    const other = await signInClient(context, 'sub-0002');
    await admin('block', { reason: 'Acoso a clientes' });
    expect((await request(context.app).get('/auth/me').set('Authorization', `Bearer ${other.token}`)).status).toBe(200);
    await admin('unblock', { reason: 'Revisado con el portero' });

    expect((await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-keeper' })).status).toBe(200);
    expect((await request(context.app).post('/auth/tokens/refresh').send({ refreshToken })).status).toBe(200);
  });
});
