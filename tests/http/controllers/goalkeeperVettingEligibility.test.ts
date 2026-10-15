import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { signInStaff } from '../adminTestHelpers.js';
import { createRequestAsClient, MATCH_NOW, ownerOf, signInClient, type TestApp } from '../operatingBalanceTestHelpers.js';
import { buildGoalkeeperProfile } from '../../fixtures/operatingBalanceFixtures.js';
import { BackgroundCheck } from '../../../src/domain/goalkeepers/backgroundCheck.js';
import { PENDING_VETTING, type Vetting } from '../../../src/domain/goalkeepers/vetting.js';

/** A client with a pending request in Cali Norte and a goalkeeper of the given vetting, with funds. */
async function setUp(vetting: Vetting = PENDING_VETTING) {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  const client = await signInClient(context, 'sub-5001');
  const goalkeeper = await signInClient(context, 'sub-5002');
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(goalkeeper.userId, { zoneIds: ['zone-cali-norte'], vetting }));
  await context.operatingBalanceLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-gk' });
  return { context, client, goalkeeper };
}

const available = (context: TestApp, token: string) => request(context.app).get('/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${token}`);
const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);

describe('an unvalidated goalkeeper takes no matches (admin spec 030, US1)', () => {
  it('sees why the list is empty and cannot accept; once validated, the reason goes away', async () => {
    const { context, client, goalkeeper } = await setUp();
    const created = await createRequestAsClient(context, client.token);

    const before = await available(context, goalkeeper.token);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ items: [], unavailableReason: 'pending_validation' });

    const refused = await accept(context, goalkeeper.token, created.bookings[0]!.bookingId);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('not_validated');
    expect(context.notificationRepository.all().filter((entry) => entry.userId === goalkeeper.userId && entry.type.startsWith('offer'))).toEqual([]);

    context.backgroundCheckRepository.seed(BackgroundCheck.upload('bc-1', goalkeeper.userId, 'img-1', context.clock.now()).approve('staff-0', context.clock.now()));
    const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
    const validated = await request(context.app)
      .post(`/admin/goalkeepers/${goalkeeper.userId}/validation`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ revision: 0, decision: 'approve' });
    expect(validated.status).toBe(200);

    const after = await available(context, goalkeeper.token);
    expect(after.body.unavailableReason).toBeNull();
  });
});

describe('reputation verifies a goalkeeper on their own (admin spec 030, US4)', () => {
  async function ratedWorld(earlierStars: number[]) {
    const { closedMatchSetUp } = await import('../closeHelpers.js');
    const { Rating } = await import('../../../src/domain/ratings/rating.js');
    const { VALIDATED_VETTING } = await import('../../fixtures/vettingFixtures.js');
    const { TEST_INTERNAL_TOKEN } = await import('../testAppFactory.js');
    const world = await closedMatchSetUp();
    // The goalkeeper is validated without the seal; the booking they already hold stays theirs.
    world.context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(world.g.userId, { vetting: VALIDATED_VETTING }));
    earlierStars.forEach((stars, index) =>
      world.context.lifecycleStore.seedRating(
        Rating.create({ id: `old-${index}`, bookingId: `old-b-${index}`, requestId: `old-r-${index}`, side: 'client', authorId: 'someone', subjectId: world.g.userId, answer: true, stars, comment: null, createdAt: new Date('2026-09-01') }),
      ),
    );
    world.context.clock.set('2026-09-21T23:30:00.000Z');
    await request(world.context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);
    return world;
  }

  const rate = (context: TestApp, token: string, bookingId: string, stars: number) =>
    request(context.app).post(`/ratings/bookings/${bookingId}`).set('Authorization', `Bearer ${token}`).send({ answer: true, stars });

  it('the fifth rating with an average above 4.0 gives the seal, and the goalkeeper is told', async () => {
    const { context, client, g, bookingId } = await ratedWorld([5, 4, 5, 4]);

    expect((await rate(context, client.token, bookingId, 5)).status).toBe(201);

    const profile = await context.goalkeeperProfileRepository.getByUserId(g.userId);
    expect(profile!.tier).toBe('verified');
    expect(profile!.vetting.verification).toMatchObject({ method: 'reputation', by: { kind: 'system' } });
    expect(context.notificationRepository.all().some((entry) => entry.userId === g.userId && entry.type === 'vetting.verified')).toBe(true);
  });

  it('an average of exactly 4.0 is not enough', async () => {
    const { context, client, g, bookingId } = await ratedWorld([4, 4, 4, 4]);

    await rate(context, client.token, bookingId, 4);

    expect((await context.goalkeeperProfileRepository.getByUserId(g.userId))!.tier).toBe('validated');
  });
});
