import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

async function signInAndComplete(
  app: ReturnType<typeof buildTestApp>['app'],
  googleValidator: ReturnType<typeof buildTestApp>['googleValidator'],
  credential: string,
  sub: string,
  whatsAppNumber = '300 000 0000',
) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  const completion = await request(app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Old', lastName: 'Name', countryCode: 'CO', whatsAppNumber, acceptedTerms: true });
  return completion.body.accessToken as string;
}

describe('PATCH /api/clients/me', () => {
  it('updates name and whatsapp, reflected on the next GET', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app)
      .patch('/api/clients/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'New', lastName: 'Name', countryCode: 'CO', whatsAppNumber: '301 987 6543' });

    expect(response.status).toBe(200);
    expect(response.body.firstName).toBe('New');

    const view = await request(app).get('/api/clients/me').set('Authorization', `Bearer ${accessToken}`);
    expect(view.body.firstName).toBe('New');
  });

  it('never changes email regardless of what is submitted', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app)
      .patch('/api/clients/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'New', lastName: 'Name', countryCode: 'CO', whatsAppNumber: '301 987 6544', email: 'hacked@example.com' });

    expect(response.body.email).toBe('sub-2@example.com');
  });

  it('rejects an update from a profile that is not yet complete', async () => {
    const { app, googleValidator } = buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-3', 'sub-3@example.com'));
    const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'good-token' });

    const response = await request(app)
      .patch('/api/clients/me')
      .set('Authorization', `Bearer ${exchange.body.accessToken}`)
      .send({ firstName: 'New', lastName: 'Name', countryCode: 'CO', whatsAppNumber: '301 987 6543' });

    expect(response.status).toBe(403);
  });

  it('rejects a duplicate number belonging to a different account', async () => {
    const { app, googleValidator } = buildTestApp();
    await signInAndComplete(app, googleValidator, 'token-a', 'sub-a', '300 111 1111');
    const accessTokenB = await signInAndComplete(app, googleValidator, 'token-b', 'sub-b', '300 222 2222');

    const response = await request(app)
      .patch('/api/clients/me')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ firstName: 'New', lastName: 'Name', countryCode: 'CO', whatsAppNumber: '300 111 1111' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('duplicate_phone_number');
  });
});
