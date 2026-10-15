import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInGoalkeeper, type TestApp } from '../operatingBalanceTestHelpers.js';

async function world() {
  const context = await buildTestApp();
  const keeper = await signInGoalkeeper(context, 'sub-0001');
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, keeper, owner };
}

const post = (context: TestApp, token: string, path: string, body: object = {}) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body);
const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

describe('blocking a user from the admin (spec 005 of the admin, US8)', () => {
  it('shows the impact, blocks with a reason, turns offers off, and shows it on the detail', async () => {
    const { context, keeper, owner } = await world();

    const impact = await get(context, owner.token, `/admin/users/${keeper.userId}/block-impact`);
    expect(impact.status).toBe(200);
    expect(impact.body).toEqual({ isGoalkeeper: true, availableForOffers: true, openRequests: { total: 0, items: [] }, upcomingBookings: { total: 0, items: [] } });

    const blocked = await post(context, owner.token, `/admin/users/${keeper.userId}/block`, { reason: 'Acoso a clientes' });
    expect(blocked.status).toBe(200);
    expect(blocked.body).toMatchObject({ userId: keeper.userId, blocked: true, reason: 'Acoso a clientes', availableForOffers: false });
    expect((await context.goalkeeperProfileRepository.getByUserId(keeper.userId))!.availableForOffers).toBe(false);

    const detail = await get(context, owner.token, `/admin/users/${keeper.userId}`);
    expect(detail.body).toMatchObject({ blocked: true, block: { blocked: true, blockReason: 'Acoso a clientes', blockedBy: { userId: 'owner-user' } } });
    expect(context.adminAuditLog.entries.find((entry) => entry.action === 'user.block')).toMatchObject({ outcome: 'done', after: { blocked: true, reason: 'Acoso a clientes' } });
  });

  it('a repeat changes nothing and is audited as replayed; unblocking keeps the offers off', async () => {
    const { context, keeper, owner } = await world();
    await post(context, owner.token, `/admin/users/${keeper.userId}/block`, { reason: 'Acoso' });

    const again = await post(context, owner.token, `/admin/users/${keeper.userId}/block`, { reason: 'Otra vez' });
    expect([again.status, again.body.reason]).toEqual([200, 'Acoso']);
    expect(context.adminAuditLog.entries.filter((entry) => entry.action === 'user.block').map((entry) => entry.outcome)).toEqual(['done', 'replayed']);

    const unblocked = await post(context, owner.token, `/admin/users/${keeper.userId}/unblock`, { reason: 'Revisado' });
    expect(unblocked.body).toMatchObject({ blocked: false, availableForOffers: false });
  });

  it('refuses a missing or short reason, and an unknown user', async () => {
    const { context, keeper, owner } = await world();

    expect((await post(context, owner.token, `/admin/users/${keeper.userId}/block`, {})).status).toBe(400);
    expect((await post(context, owner.token, `/admin/users/${keeper.userId}/block`, { reason: 'ab' })).body.error).toBe('validation_failed');
    expect((await post(context, owner.token, '/admin/users/nobody/block', { reason: 'Fraude' })).body.error).toBe('user_not_found');
    expect((await get(context, owner.token, '/admin/users/nobody/block-impact')).status).toBe(404);
  });

  it('needs users.block', async () => {
    const { context, keeper } = await world();
    await seedRole(context, 'lector', ['users.read']);
    const reader = await signInStaff(context, { key: 'lector', roleId: 'lector' });

    for (const path of ['block', 'unblock']) expect((await post(context, reader.token, `/admin/users/${keeper.userId}/${path}`, { reason: 'Fraude' })).status).toBe(403);
    expect((await get(context, reader.token, `/admin/users/${keeper.userId}/block-impact`)).status).toBe(403);
  });
});
