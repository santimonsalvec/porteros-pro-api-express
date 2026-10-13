import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { closedMatchSetUp } from '../closeHelpers.js';
import type { TestApp } from '../walletTestHelpers.js';

const get = (context: TestApp, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);

/** The match closes; the client gives G one star ("didn't come"), G gives the client five. */
async function world() {
  const { context, client, g, bookingId, requestId } = await closedMatchSetUp();
  context.clock.set('2026-09-21T23:30:00.000Z');
  await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);
  expect((await request(context.app).post(`/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${client.token}`).send({ answer: false, stars: 1, comment: 'No vino' })).status).toBe(201);
  context.clock.set('2026-09-21T23:40:00.000Z');
  expect((await request(context.app).post(`/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${g.token}`).send({ answer: true, stars: 5 })).status).toBe(201);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, client, g, owner, bookingId, requestId };
}

describe('admin ratings (spec 006 of the admin, US4)', () => {
  it('lists ratings newest first with roles, the match and the case it opened; never audited', async () => {
    const { context, owner, client, g, requestId } = await world();
    context.adminAuditLog.entries.length = 0;

    const all = await get(context, owner.token, '/admin/ratings');

    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, totalItems: 2 });
    expect(all.body.items[0]).toMatchObject({ side: 'goalkeeper', author: { userId: g.userId, role: 'goalkeeper' }, subject: { userId: client.userId, role: 'client' }, stars: 5, caseId: null });
    expect(all.body.items[1]).toMatchObject({ side: 'client', stars: 1, answer: false, comment: 'No vino', requestId, caseId: expect.any(String), match: { timeZone: expect.any(String) } });
    expect(context.adminAuditLog.entries).toEqual([]);
  });

  it('filters by person, side, stars and dates', async () => {
    const { context, owner, client, g } = await world();
    const count = async (query: string) => (await get(context, owner.token, `/admin/ratings?${query}`)).body.totalItems as number;

    expect(await count(`goalkeeperId=${g.userId}`)).toBe(2);
    expect(await count(`clientId=${client.userId}`)).toBe(2);
    expect(await count('goalkeeperId=someone-else')).toBe(0);
    expect(await count('side=client')).toBe(1);
    expect(await count('starsMin=1&starsMax=2')).toBe(1);
    expect(await count('from=2026-09-21T23:35:00.000Z')).toBe(1);
  });

  it('refuses malformed filters and needs ratings.read', async () => {
    const { context, owner } = await world();
    for (const query of ['starsMin=0', 'starsMax=6', 'starsMin=4&starsMax=2', 'side=both', 'from=ayer']) {
      const response = await get(context, owner.token, `/admin/ratings?${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body.error).toBe('validation_failed');
    }
    await seedRole(context, 'soporte', ['cases.read']);
    const support = await signInStaff(context, { key: 'support', userId: 'support-user', roleId: 'soporte' });
    expect((await get(context, support.token, '/admin/ratings')).status).toBe(403);
  });
});
