import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { MATCH_NOW, ownerOf, signInClient, type TestApp } from '../operatingBalanceTestHelpers.js';
import { buildGoalkeeperProfile } from '../../fixtures/operatingBalanceFixtures.js';
import { QUOTE_FORMAT_FIELDS } from '../../fixtures/quoteFixtures.js';
import { VALIDATED_VETTING } from '../../fixtures/vettingFixtures.js';

/** Cali (Colombia) with a 10 % discount and a 2-minute verified-only window; a validated goalkeeper with funds. */
async function setUp() {
  const context = await buildTestApp();
  context.clock.set(MATCH_NOW);
  context.unverifiedDiscountRepository.seed('country', 'country-co', 1000, 'co', 2);
  const client = await signInClient(context, 'sub-6001');
  const goalkeeper = await signInClient(context, 'sub-6002');
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(goalkeeper.userId, { zoneIds: ['zone-cali-norte'], vetting: VALIDATED_VETTING }));
  await context.operatingBalanceLedger.adjust(ownerOf(goalkeeper.userId), { adminUserId: 'admin-1', amount: 20000, reason: 'Saldo de pruebas', operationKey: 'k-gk' });
  return { context, client, goalkeeper };
}

const quote = (context: TestApp, token: string, startsAt = '2026-09-21T15:00:00') =>
  request(context.app)
    .post('/goalkeeper-requests/quote')
    .set('Authorization', `Bearer ${token}`)
    .send({ latitude: 3.45, longitude: -76.5, startsAt, goalkeeperCount: 1, durationMinutes: 90, ...QUOTE_FORMAT_FIELDS });

const confirm = (context: TestApp, token: string, quoteId: string, acceptUnverified?: boolean) =>
  request(context.app).post('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${token}`).send({ quoteId, ...(acceptUnverified === undefined ? {} : { acceptUnverified }) });

const accept = (context: TestApp, token: string, bookingId: string) =>
  request(context.app).post(`/goalkeepers/me/bookings/${bookingId}/accept`).set('Authorization', `Bearer ${token}`);

describe('a client accepts goalkeepers without the seal (admin spec 030, US3)', () => {
  it('quotes the discounted price, offers verified goalkeepers first, then charges the full commission to whoever takes it', async () => {
    const { context, client, goalkeeper } = await setUp();

    const quoted = await quote(context, client.token);
    expect(quoted.status).toBe(200);
    expect(quoted.body.unverifiedDiscount).toEqual({ rateBps: 1000, unitDiscount: 6000, unitTotal: 54000 });

    const created = await confirm(context, client.token, quoted.body.quoteId, true);
    expect(created.status).toBe(201);
    expect(created.body.acceptsUnverified).toBe(true);
    const bookingId = created.body.bookings[0].bookingId as string;

    const early = await accept(context, goalkeeper.token, bookingId);
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('verified_only');

    context.clock.set('2026-09-21T18:32:00.000Z');
    const available = await request(context.app).get('/goalkeepers/me/available-bookings').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(available.body.items[0]).toMatchObject({ bookingId, earnings: 54000, discount: { rateBps: 1000, amount: 6000 } });

    const taken = await accept(context, goalkeeper.token, bookingId);
    expect(taken.status).toBe(201);
    expect(taken.body).toMatchObject({ earnings: 54000, commission: 7000, discount: { rateBps: 1000, amount: 6000 } });
    const movements = await request(context.app).get('/goalkeepers/me/operating-balance/movements').set('Authorization', `Bearer ${goalkeeper.token}`);
    expect(movements.body.items[0]).toMatchObject({ type: 'commission_charge', amount: -7000 });

    // A later change of the discount does not touch what the client saw (FR-019).
    context.unverifiedDiscountRepository.seed('country', 'country-co', 2500, 'co', 2);
    const requests = await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`);
    const booking = requests.body.items[0].bookings[0];
    expect(booking).toMatchObject({ total: 54000, discount: 6000, unverifiedGoalkeeper: true });
  });

  it('without the client\'s choice a goalkeeper without the seal never takes the match', async () => {
    const { context, client, goalkeeper } = await setUp();
    const quoted = await quote(context, client.token);
    const created = await confirm(context, client.token, quoted.body.quoteId);

    context.clock.set('2026-09-21T19:00:00.000Z');
    const refused = await accept(context, goalkeeper.token, created.body.bookings[0].bookingId);

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('verified_only');
    expect(created.body).not.toHaveProperty('acceptsUnverified');
  });

  it('nothing the client reads mentions validation, the tier or how a goalkeeper was verified (FR-005)', async () => {
    const { context, client, goalkeeper } = await setUp();
    const quoted = await quote(context, client.token);
    const created = await confirm(context, client.token, quoted.body.quoteId, true);
    context.clock.set('2026-09-21T18:32:00.000Z');
    await accept(context, goalkeeper.token, created.body.bookings[0].bookingId);
    const list = await request(context.app).get('/goalkeeper-requests/bookings').set('Authorization', `Bearer ${client.token}`);
    const detail = await request(context.app).get(`/goalkeeper-requests/bookings/${created.body.requestId}`).set('Authorization', `Bearer ${client.token}`);

    for (const body of [quoted.body, created.body, list.body, detail.body]) {
      expect(JSON.stringify(body)).not.toMatch(/validat|tier|vetting|"method"/i);
    }
  });
});
