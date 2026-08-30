import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

async function signInMobile(app: ReturnType<typeof buildTestApp>['app'], googleValidator: ReturnType<typeof buildTestApp>['googleValidator'], credential: string, sub: string) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const response = await request(app)
    .post('/api/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential });
  return response.body.accessToken as string;
}

describe('POST /api/profile/complete', () => {
  it('completes the profile and returns fresh tokens', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app)
      .post('/api/profile/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Jhon', lastName: 'Doe', countryCode: 'CO', whatsAppNumber: '300 123 4567', acceptedTerms: true });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/api/profile/complete')
      .send({ firstName: 'Jhon', lastName: 'Doe', countryCode: 'CO', whatsAppNumber: '300 123 4567', acceptedTerms: true });

    expect(response.status).toBe(401);
  });

  it('rejects a blank name with field errors', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app)
      .post('/api/profile/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: '', lastName: 'Doe', countryCode: 'CO', whatsAppNumber: '300 123 4567', acceptedTerms: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(response.body.fieldErrors.firstName).toBeDefined();
  });

  it('rejects an unrecognized country code', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-3');

    const response = await request(app)
      .post('/api/profile/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Jhon', lastName: 'Doe', countryCode: 'ZZ', whatsAppNumber: '300 123 4567', acceptedTerms: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_country_code');
  });

  it('is a no-op when already complete', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-4');
    await request(app)
      .post('/api/profile/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Jhon', lastName: 'Doe', countryCode: 'CO', whatsAppNumber: '300 123 4567', acceptedTerms: true });

    const secondAttempt = await request(app)
      .post('/api/profile/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Jhon', lastName: 'Doe', countryCode: 'CO', whatsAppNumber: '300 123 4567', acceptedTerms: true });

    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error).toBe('profile_already_complete');
  });
});
