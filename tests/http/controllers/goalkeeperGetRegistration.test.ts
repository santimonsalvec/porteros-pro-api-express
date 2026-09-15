import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { GoalkeeperRegistration } from '../../../src/domain/goalkeepers/goalkeeperRegistration.js';

async function signInAndComplete(
  app: ReturnType<typeof buildTestApp>['app'],
  googleValidator: ReturnType<typeof buildTestApp>['googleValidator'],
  credential: string,
  sub: string,
) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  const completion = await request(app)
    .post('/api/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Old', lastName: 'Name', countryCode: 'CO', whatsAppNumber: `300 000 ${sub.slice(-4).padStart(4, '0')}`, acceptedTerms: true });
  return completion.body.accessToken as string;
}

describe('GET /api/goalkeepers/me', () => {
  it('returns not_started for a client who never saved anything', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-1');

    const response = await request(app).get('/api/goalkeepers/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('not_started');
    expect(response.body.sections.identification.complete).toBe(false);
    expect(response.body.heightCm).toBeNull();
    expect(response.body.cityId).toBeNull();
    expect(response.body.serviceZoneIds).toEqual([]);
  });

  it('reflects a previously saved city and service zones', async () => {
    const { app, googleValidator, goalkeeperRegistrationRepository, tokenIssuer } = buildTestApp();
    const accessToken = await signInAndComplete(app, googleValidator, 'good-token', 'sub-5');
    const claims = await tokenIssuer.verifyAccessToken(accessToken);
    const registration = GoalkeeperRegistration.createEmpty('reg-5', claims!.sub);
    registration.saveAvailability({ cityId: 'city-envigado', zoneIds: ['zone-bello', 'zone-copacabana'] });
    goalkeeperRegistrationRepository.seed(registration);

    const response = await request(app).get('/api/goalkeepers/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.cityId).toBe('city-envigado');
    expect(response.body.serviceZoneIds).toEqual(['zone-bello', 'zone-copacabana']);
    expect(response.body.sections.availability.complete).toBe(true);
  });

  it('rejects a request with no token', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/goalkeepers/me');

    expect(response.status).toBe(401);
  });

  it('rejects a client whose own profile is not yet complete', async () => {
    const { app, googleValidator } = buildTestApp();
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'sub-2', 'sub-2@example.com'));
    const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential: 'good-token' });

    const response = await request(app).get('/api/goalkeepers/me').set('Authorization', `Bearer ${exchange.body.accessToken}`);

    expect(response.status).toBe(403);
  });
});
