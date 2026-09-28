import request from 'supertest';
import type { buildTestApp } from './testAppFactory.js';
import { ExternalIdentity } from '../../src/domain/users/externalIdentity.js';
import { User } from '../../src/domain/users/user.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING } from '../fixtures/walletFixtures.js';
import type { LedgerOwner } from '../../src/application/features/wallet/common/walletLedger.js';

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Signs in and completes the client profile; returns the token and the user id. */
export async function signInClient(context: TestApp, sub: string): Promise<{ token: string; userId: string }> {
  context.googleValidator.registerValidCredential(`cred-${sub}`, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(context.app)
    .post('/api/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(context.app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Ana', lastName: 'Portera', countryCode: 'CO', whatsAppNumber: `300 000 ${sub.slice(-4).padStart(4, '0')}`, acceptedTerms: true });
  const token = completion.body.accessToken as string;
  const me = await request(context.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  return { token, userId: me.body.userId as string };
}

/** A signed-in client who is also an active goalkeeper of Cali with the given zones. */
export async function signInGoalkeeper(context: TestApp, sub: string, zoneIds = ['zone-cali-norte']) {
  const client = await signInClient(context, sub);
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(client.userId, { zoneIds }));
  return client;
}

/** An administrator's access token (admin-web sign-in of a user flagged as admin). */
export async function signInAdmin(context: TestApp): Promise<{ token: string; userId: string }> {
  await context.userRepository.add(
    User.createFromExternalIdentity({ id: 'admin-1', email: 'admin@example.com', displayName: null, provider: 'google', subject: 'admin-sub', isAdmin: true }),
  );
  context.googleValidator.registerValidCredential('admin-cred', new ExternalIdentity('google', 'admin-sub', 'admin@example.com'));
  const exchange = await request(context.app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'admin-web', credential: 'admin-cred' });
  return { token: exchange.body.accessToken as string, userId: 'admin-1' };
}

export function ownerOf(goalkeeperId: string): LedgerOwner {
  return { goalkeeperId, currency: 'COP', invoicing: COLOMBIA_INVOICING };
}
