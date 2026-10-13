import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';

const get = (context: TestApp, path: string, token?: string) => {
  const pending = request(context.app).get(path);
  return token ? pending.set('Authorization', `Bearer ${token}`) : pending;
};

/** A client with a phone registered, one notice read and one deleted, and an owner. */
async function world() {
  const context = await buildTestApp();
  const client = await signInClient(context, 'sub-4001');
  await request(context.app).post('/devices').set('Authorization', `Bearer ${client.token}`).send({ token: 'phone-4001', platform: 'android' });
  const now = context.clock.now();
  for (const [id, title] of [['n-1', 'Partido cancelado'], ['n-2', 'Te devolvimos 9.913 COP']] as const) {
    await context.notificationRepository.createIfAbsent({ id, userId: client.userId, type: 'booking.cancelled', title, body: 'b', data: { type: 'booking.cancelled', requestId: 'r-1' }, createdAt: now, dedupeKey: id });
  }
  await context.notificationRepository.markRead('n-1', client.userId, now);
  await context.notificationRepository.deleteForUser('n-2', client.userId, now);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, owner };
}

describe("a user's notices for the admin (spec 006 of the admin, US3)", () => {
  it('lists every notice, the deleted ones marked, with the devices and no token', async () => {
    const { context, client, owner } = await world();
    context.adminAuditLog.entries.length = 0;

    const response = await get(context, `/admin/notifications?userId=${client.userId}`, owner.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, devices: { count: 1, lastSeenAt: expect.any(String) } });
    const byId = Object.fromEntries((response.body.items as { notificationId: string }[]).map((item) => [item.notificationId, item]));
    expect(byId['n-1']).toMatchObject({ title: 'Partido cancelado', readAt: expect.any(String), deletedAt: null, requestId: 'r-1', push: { kind: 'on_create' } });
    expect(byId['n-2']).toMatchObject({ deletedAt: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain('phone-4001');
    expect(context.adminAuditLog.entries).toEqual([]);
  });

  it('refuses a missing user id, answers 404 for nobody, and needs notifications.read', async () => {
    const { context, client, owner } = await world();
    await seedRole(context, 'soporte', ['users.read']);
    const support = await signInStaff(context, { key: 'support', userId: 'support-user', roleId: 'soporte' });

    const missing = await get(context, '/admin/notifications', owner.token);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('validation_failed');
    const nobody = await get(context, '/admin/notifications?userId=nobody', owner.token);
    expect(nobody.status).toBe(404);
    expect(nobody.body.error).toBe('user_not_found');
    expect((await get(context, `/admin/notifications?userId=${client.userId}`, support.token)).status).toBe(403);
    expect((await get(context, `/admin/notifications?userId=${client.userId}`)).status).toBe(401);
    expect((await get(context, `/admin/notifications?userId=${client.userId}`, client.token)).status).toBe(401);
  });
});
