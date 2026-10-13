import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING } from '../../fixtures/walletFixtures.js';

async function world() {
  const context = await buildTestApp();
  const keeper = await signInClient(context, 'sub-0001');
  const later = new Date(context.clock.now().getTime() + 3 * 24 * 60 * 60 * 1000);
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(keeper.userId, { suspendedUntil: later, availableForOffers: false }));
  const other = await signInClient(context, 'sub-0002');
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(other.userId, { cityId: 'city-other', zoneIds: [] }));
  const client = await signInClient(context, 'sub-0003');
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, keeper, other, client, owner, later };
}

const get = (context: TestApp, path: string, token?: string) => {
  const pending = request(context.app).get(path);
  return token ? pending.set('Authorization', `Bearer ${token}`) : pending;
};
const ids = (response: request.Response) => response.body.items.map((row: { userId: string }) => row.userId);

describe('admin goalkeepers (spec 005 of the admin, US2)', () => {
  it('lists goalkeepers only, filtered by city, suspension, offers, balance and search', async () => {
    const { context, keeper, other, owner, later } = await world();

    const all = await get(context, '/admin/goalkeepers', owner.token);
    expect(all.status).toBe(200);
    expect(ids(all).sort()).toEqual([keeper.userId, other.userId].sort());
    expect(all.body.items).toContainEqual(expect.objectContaining({
      userId: keeper.userId, name: 'Ana Portera', availableForOffers: false, suspendedUntil: later.toISOString(), balance: 0, rating: null, blocked: false,
    }));

    expect(ids(await get(context, '/admin/goalkeepers?cityId=city-other', owner.token))).toEqual([other.userId]);
    expect(ids(await get(context, '/admin/goalkeepers?suspended=true', owner.token))).toEqual([keeper.userId]);
    expect(ids(await get(context, '/admin/goalkeepers?availableForOffers=true', owner.token))).toEqual([other.userId]);
    expect(ids(await get(context, '/admin/goalkeepers?balanceBelow=1', owner.token)).length).toBe(2);
    expect(ids(await get(context, '/admin/goalkeepers?balanceBelow=0', owner.token))).toEqual([]);
    expect(ids(await get(context, `/admin/goalkeepers?q=${encodeURIComponent('300 000 0002')}`, owner.token))).toEqual([other.userId]);
  });

  it('refuses a malformed query', async () => {
    const { context, owner } = await world();

    for (const query of ['suspended=yes', 'balanceBelow=abc', 'balanceBelow=1.5', 'pageSize=0']) {
      expect((await get(context, `/admin/goalkeepers?${query}`, owner.token)).status, query).toBe(400);
    }
  });

  it('answers the detail without the document number, and 404 for a client', async () => {
    const { context, keeper, client, owner } = await world();

    const detail = await get(context, `/admin/goalkeepers/${keeper.userId}`, owner.token);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ userId: keeper.userId, heightCm: 185, documentType: { code: COLOMBIA_INVOICING.documentType }, version: expect.any(String) });
    expect(JSON.stringify(detail.body)).not.toContain(COLOMBIA_INVOICING.documentNumber);

    const notGoalkeeper = await get(context, `/admin/goalkeepers/${client.userId}`, owner.token);
    expect(notGoalkeeper.status).toBe(404);
    expect(notGoalkeeper.body.error).toBe('goalkeeper_not_found');
  });

  it.each(['/admin/goalkeepers', '/admin/goalkeepers/u-1'])('%s needs goalkeepers.read, an admin session and not a mobile token', async (path) => {
    const { context, client } = await world();
    await seedRole(context, 'otro', ['users.read']);
    const other = await signInStaff(context, { key: 'otro', roleId: 'otro' });

    expect((await get(context, path)).status).toBe(401);
    expect((await get(context, path, client.token)).status).toBe(401);
    expect((await get(context, path, other.token)).status).toBe(403);
  });
});
