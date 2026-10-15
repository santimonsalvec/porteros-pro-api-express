import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { CSRF, seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../operatingBalanceTestHelpers.js';

const testPushAs = (context: TestApp, token: string, userId: string) =>
  request(context.app).post(`/admin/users/${userId}/test-push`).set('Authorization', `Bearer ${token}`).set(CSRF).send();

async function world() {
  const context = await buildTestApp();
  const client = await signInClient(context, 'sub-4101');
  await request(context.app).post('/devices').set('Authorization', `Bearer ${client.token}`).send({ token: 'phone-4101', platform: 'android' });
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, owner };
}

describe('a test push sent by the admin (spec 006 of the admin, US3)', () => {
  it("reaches the user's devices, never the member's, and is audited without its text", async () => {
    const { context, client, owner } = await world();
    context.adminAuditLog.entries.length = 0;

    const response = await testPushAs(context, owner.token, client.userId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: 1, removed: 0, failed: 0, noDevice: false });
    expect(context.pushSender.calls.map((call) => call.token)).toEqual(['phone-4101']);
    expect(context.pushSender.calls[0]!.message.data.type).toBe('test');
    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ action: 'user.test_push', resourceType: 'user', resourceId: client.userId, permission: 'notifications.send', outcome: 'done' }),
    ]);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toMatch(/Notificación de prueba/);
  });

  it("shares the app's limit for that user: past it, 429 with the wait, and nothing audited", async () => {
    const { context, client, owner } = await world();
    for (let sent = 0; sent < 4; sent += 1) {
      expect((await request(context.app).post('/devices/test-push').set('Authorization', `Bearer ${client.token}`).send()).status).toBe(200);
    }
    expect((await testPushAs(context, owner.token, client.userId)).status).toBe(200);
    context.adminAuditLog.entries.length = 0;

    const limited = await testPushAs(context, owner.token, client.userId);

    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('too_many_requests');
    expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(context.adminAuditLog.entries.filter((entry) => entry.outcome === 'done')).toEqual([]);
  });

  it('answers 404 for nobody and needs notifications.send', async () => {
    const { context, client, owner } = await world();
    await seedRole(context, 'soporte', ['notifications.read']);
    const support = await signInStaff(context, { key: 'support', userId: 'support-user', roleId: 'soporte' });

    const nobody = await testPushAs(context, owner.token, 'nobody');
    expect(nobody.status).toBe(404);
    expect(nobody.body.error).toBe('user_not_found');
    expect((await testPushAs(context, support.token, client.userId)).status).toBe(403);
    expect(context.pushSender.calls).toEqual([]);
  });
});
