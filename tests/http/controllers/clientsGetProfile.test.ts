import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { User } from '../../../src/domain/users/user.js';

async function signInMobile(app: ReturnType<typeof buildTestApp>['app'], googleValidator: ReturnType<typeof buildTestApp>['googleValidator'], credential: string, sub: string) {
  googleValidator.registerValidCredential(credential, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const response = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'mobile', credential });
  return response.body.accessToken as string;
}

describe('GET /api/clients/me', () => {
  it('returns the five expected fields for a completed profile', async () => {
    const { app, googleValidator, userRepository, tokenIssuer } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-1');
    const user = await userRepository.findByExternalIdentity('google', 'sub-1');
    user!.completeProfile('Jhon', 'Doe', '+57', '300 123 4567');
    await userRepository.update(user!);
    void tokenIssuer;

    const response = await request(app).get('/api/clients/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.firstName).toBe('Jhon');
    expect(response.body.email).toBe('sub-1@example.com');
  });

  it('represents an incomplete profile with empty fields rather than failing', async () => {
    const { app, googleValidator } = buildTestApp();
    const accessToken = await signInMobile(app, googleValidator, 'good-token', 'sub-2');

    const response = await request(app).get('/api/clients/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.firstName).toBeNull();
    expect(response.body.email).toBe('sub-2@example.com');
  });

  it('rejects an admin account', async () => {
    const { app, googleValidator, userRepository } = buildTestApp();
    const admin = User.createFromExternalIdentity({ id: 'admin-1', email: 'admin@example.com', displayName: null, provider: 'google', subject: 'admin-sub', isAdmin: true });
    await userRepository.add(admin);
    googleValidator.registerValidCredential('good-token', new ExternalIdentity('google', 'admin-sub', 'admin@example.com'));
    const exchange = await request(app).post('/api/auth/sso/exchange').send({ provider: 'google', platform: 'admin-web', credential: 'good-token' });

    const response = await request(app).get('/api/clients/me').set('Authorization', `Bearer ${exchange.body.accessToken}`);

    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/clients/me');

    expect(response.status).toBe(401);
  });
});
