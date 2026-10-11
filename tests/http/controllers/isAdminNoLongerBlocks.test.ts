import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { User } from '../../../src/domain/users/user.js';
import type { TestApp } from '../walletTestHelpers.js';

/** An app account flagged `isAdmin` that signs in on the phone and completes its profile. */
async function signInFlaggedAccount(context: TestApp): Promise<string> {
  await context.userRepository.add(
    User.createFromExternalIdentity({ id: 'user-flagged', email: 'dueno@example.com', displayName: null, provider: 'google', subject: 'sub-flagged', isAdmin: true }),
  );
  context.googleValidator.registerValidCredential('cred-flagged', new ExternalIdentity('google', 'sub-flagged', 'dueno@example.com'));
  const exchange = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'cred-flagged' });
  const completion = await request(context.app)
    .post('/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Dueño', lastName: 'PorterosPRO', countryCode: 'CO', whatsAppNumber: '300 000 9999', acceptedTerms: true });
  return completion.body.accessToken as string;
}

describe('isAdmin no longer blocks the app (spec 001, FR-020)', () => {
  it('an account flagged isAdmin uses the client routes like anyone else', async () => {
    const context = await buildTestApp();
    const token = await signInFlaggedAccount(context);
    const auth = { Authorization: `Bearer ${token}` };

    expect((await request(context.app).get('/clients/me').set(auth)).status).toBe(200);
    expect((await request(context.app).get('/goalkeeper-requests/bookings').set(auth)).status).toBe(200);
    expect((await request(context.app).get('/ratings/pending').set(auth)).status).toBe(200);
  });

  it('GET /auth/me keeps answering isAdmin as a boolean, always false', async () => {
    const context = await buildTestApp();
    const token = await signInFlaggedAccount(context);

    const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.isAdmin).toBe(false);
  });

  it("the old admin-web exchange points to the admin web's own sign-in", async () => {
    const context = await buildTestApp();
    context.googleValidator.registerValidCredential('cred', new ExternalIdentity('google', 'sub-x', 'x@example.com'));

    const response = await request(context.app).post('/auth/sso/exchange').send({ provider: 'google', platform: 'admin-web', credential: 'cred' });

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('admin_sign_in_moved');
  });
});
