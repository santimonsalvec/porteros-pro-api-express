import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInAdmin, signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';

const TOKEN = 'fcm-token-0000000000000000000000000000000000';

const register = (context: TestApp, bearer: string, body: unknown) =>
  request(context.app).post('/api/devices').set('Authorization', `Bearer ${bearer}`).send(body as object);
const unregister = (context: TestApp, bearer: string, body: unknown) =>
  request(context.app).post('/api/devices/unregister').set('Authorization', `Bearer ${bearer}`).send(body as object);
const testPush = (context: TestApp, bearer: string) =>
  request(context.app).post('/api/devices/test-push').set('Authorization', `Bearer ${bearer}`).send();

/** Signed in through SSO only: the profile is not completed yet. */
async function signInWithoutProfile(context: TestApp, sub: string): Promise<string> {
  context.googleValidator.registerValidCredential(`cred-${sub}`, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(context.app)
    .post('/api/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  return exchange.body.accessToken as string;
}

describe('POST /api/devices — US1: a signed-in phone can receive notifications', () => {
  it('registers a device, and a repeat keeps one device', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0001');

    expect((await register(context, client.token, { token: TOKEN, platform: 'android' })).status).toBe(204);
    expect((await register(context, client.token, { token: TOKEN, platform: 'android' })).status).toBe(204);

    expect(context.deviceRepository.all()).toMatchObject([{ token: TOKEN, userId: client.userId, platform: 'android' }]);
  });

  it('keeps several devices per user', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0002');

    await register(context, client.token, { token: TOKEN, platform: 'android' });
    await register(context, client.token, { token: `${TOKEN}-ipad`, platform: 'ios' });

    expect(await context.deviceRepository.findByUserIds([client.userId])).toHaveLength(2);
  });

  it('accepts any signed-in user: no completed profile, a goalkeeper, an administrator', async () => {
    const context = await buildTestApp();
    const newcomer = await signInWithoutProfile(context, 'sub-0003');
    const goalkeeper = await signInGoalkeeper(context, 'sub-0004');
    const admin = await signInAdmin(context);

    const statuses = [
      (await register(context, newcomer, { token: 'tok-new', platform: 'ios' })).status,
      (await register(context, goalkeeper.token, { token: 'tok-gk', platform: 'android' })).status,
      (await register(context, admin.token, { token: 'tok-admin', platform: 'ios' })).status,
    ];

    expect(statuses).toEqual([204, 204, 204]);
    expect(context.deviceRepository.all()).toHaveLength(3);
  });

  it.each([
    ['a missing token', { platform: 'android' }],
    ['an empty token', { token: '  ', platform: 'android' }],
    ['a 4,097-character token', { token: 'x'.repeat(4097), platform: 'android' }],
    ['an unknown platform', { token: TOKEN, platform: 'web' }],
  ])('refuses %s with 400 and stores nothing', async (_label, body) => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0005');

    const response = await register(context, client.token, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_failed');
    expect(context.deviceRepository.all()).toHaveLength(0);
  });

  it('refuses a request without a session', async () => {
    const context = await buildTestApp();

    expect((await request(context.app).post('/api/devices').send({ token: TOKEN, platform: 'ios' })).status).toBe(401);
  });

  it('leaves one device after 20 simultaneous registrations of the same token', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0006');

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => register(context, client.token, { token: TOKEN, platform: 'android' })),
    );

    expect(responses.every((response) => response.status === 204)).toBe(true);
    expect(context.deviceRepository.all()).toHaveLength(1);
  });
});

describe('POST /api/devices/unregister — US2: a shared phone notifies only the person signed in', () => {
  it('moves a token to the user who registers it last', async () => {
    const context = await buildTestApp();
    const a = await signInClient(context, 'sub-0011');
    const b = await signInClient(context, 'sub-0012');

    await register(context, a.token, { token: TOKEN, platform: 'android' });
    expect((await register(context, b.token, { token: TOKEN, platform: 'android' })).status).toBe(204);

    expect(context.deviceRepository.all()).toMatchObject([{ token: TOKEN, userId: b.userId }]);
  });

  it("answers 204 for someone else's token without touching it, then removes it for its owner", async () => {
    const context = await buildTestApp();
    const a = await signInClient(context, 'sub-0013');
    const b = await signInClient(context, 'sub-0014');
    await register(context, a.token, { token: TOKEN, platform: 'android' });
    await register(context, b.token, { token: TOKEN, platform: 'android' });

    expect((await unregister(context, a.token, { token: TOKEN })).status).toBe(204);
    expect(context.deviceRepository.all()).toMatchObject([{ userId: b.userId }]);

    expect((await unregister(context, b.token, { token: TOKEN })).status).toBe(204);
    expect(context.deviceRepository.all()).toHaveLength(0);

    expect((await unregister(context, b.token, { token: TOKEN })).status).toBe(204);
  });

  it('refuses an invalid body and a request without a session', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-0015');

    expect((await unregister(context, client.token, {})).status).toBe(400);
    expect((await request(context.app).post('/api/devices/unregister').send({ token: TOKEN })).status).toBe(401);
  });

  it('leaves the token with exactly one of two users registering it at once', async () => {
    const context = await buildTestApp();
    const a = await signInClient(context, 'sub-0016');
    const b = await signInClient(context, 'sub-0017');

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => register(context, index % 2 ? a.token : b.token, { token: TOKEN, platform: 'ios' })),
    );

    const devices = context.deviceRepository.all();
    expect(devices).toHaveLength(1);
    expect([a.userId, b.userId]).toContain(devices[0]!.userId);
  });
});

describe('/api/devices in the API document', () => {
  it('documents the three device endpoints', async () => {
    const context = await buildTestApp();

    const response = await request(context.app).get('/openapi.json');

    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining(['/api/devices', '/api/devices/unregister', '/api/devices/test-push']),
    );
  });
});

describe('POST /api/devices/test-push — US6: a signed-in user can check that pushes reach their phone', () => {
  it("sends only to the caller's own devices", async () => {
    const context = await buildTestApp();
    const me = await signInClient(context, 'sub-0021');
    const other = await signInClient(context, 'sub-0022');
    await register(context, me.token, { token: 'my-phone', platform: 'android' });
    await register(context, me.token, { token: 'my-tablet', platform: 'ios' });
    await register(context, other.token, { token: 'other-phone', platform: 'ios' });

    const response = await testPush(context, me.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: 2, removed: 0, failed: 0, noDevice: false });
    expect(context.pushSender.calls.map((call) => call.token).sort()).toEqual(['my-phone', 'my-tablet']);
    expect(context.pushSender.calls[0]!.message.data.type).toBe('test');
  });

  it('says so when the caller has no device', async () => {
    const context = await buildTestApp();
    const me = await signInClient(context, 'sub-0023');

    const response = await testPush(context, me.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: 0, removed: 0, failed: 0, noDevice: true });
  });

  it('removes a device the push service reports invalid', async () => {
    const context = await buildTestApp();
    const me = await signInClient(context, 'sub-0024');
    await register(context, me.token, { token: 'dead-phone', platform: 'android' });
    context.pushSender.setOutcome('dead-phone', 'invalid');

    const response = await testPush(context, me.token);

    expect(response.body).toEqual({ reached: 0, removed: 1, failed: 0, noDevice: false });
    expect(context.deviceRepository.all()).toHaveLength(0);
  });

  it('refuses the 6th test push within a minute with 429 and Retry-After', async () => {
    const context = await buildTestApp();
    const me = await signInClient(context, 'sub-0025');

    for (let call = 0; call < 5; call += 1) expect((await testPush(context, me.token)).status).toBe(200);
    const refused = await testPush(context, me.token);

    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: 'too_many_requests', retryAfterSeconds: 60 });
    expect(refused.headers['retry-after']).toBe('60');
  });

  it('refuses a request without a session', async () => {
    const context = await buildTestApp();

    expect((await request(context.app).post('/api/devices/test-push').send()).status).toBe(401);
  });
});
