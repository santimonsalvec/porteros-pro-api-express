import { testMarket } from '../../fakes/fakeMarketRepository.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Booking } from '../../../src/domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../../src/domain/bookings/goalkeeperPrice.js';
import { buildRequest, buildRequestBookings } from '../../fixtures/quoteFixtures.js';
import { buildGoalkeeperProfile } from '../../fixtures/operatingBalanceFixtures.js';
import { buildTestApp } from '../testAppFactory.js';
import { signInClient, signInGoalkeeper, type TestApp } from '../operatingBalanceTestHelpers.js';

function stats(context: TestApp, token: string) {
  return request(context.app).get('/goalkeepers/me/stats').set('Authorization', `Bearer ${token}`);
}

const template = buildRequestBookings(
  buildRequest('r-stats', new Date('2026-10-01T20:00:00.000Z')),
)[0]!;

function played(id: string, goalkeeperId: string, startsAt: string, total: number): Booking {
  return Booking.rehydrate({
    ...template,
    id,
    startsAt: new Date(startsAt),
    endsAt: new Date(new Date(startsAt).getTime() + 3_600_000),
    price: new GoalkeeperPrice({ unitRate: total, unitSurcharge: 0, total, currency: 'COP' }),
    status: 'completed',
    goalkeeperId,
    assignedAt: new Date('2026-09-01T00:00:00.000Z'),
    attendance: 'attended',
  });
}

describe("GET /goalkeepers/me/stats — US1: the goalkeeper's month in numbers", () => {
  it('answers every field of the contract, computed from the bookings', async () => {
    const context = await buildTestApp();
    context.clock.set('2026-10-07T17:00:00.000Z');
    const goalkeeper = await signInGoalkeeper(context, 'sub-2601');
    context.bookingRepository.seed(
      played('b-1', goalkeeper.userId, '2026-10-02T23:00:00.000Z', 70000),
    );
    context.bookingRepository.seed(
      played('b-2', goalkeeper.userId, '2026-10-03T23:00:00.000Z', 80000),
    );
    context.bookingRepository.seed(
      played('b-3', goalkeeper.userId, '2026-09-03T23:00:00.000Z', 100000),
    );

    const response = await stats(context, goalkeeper.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: { year: 2026, month: 10 },
      currency: 'COP',
      earned: 150000,
      playedCount: 2,
      averagePerMatch: 75000,
      toPlay: 0,
      previous: { month: { year: 2026, month: 9 }, throughDay: 7, earned: 100000 },
      changePercent: 50,
    });
  });

  it('401 without a token, 404 goalkeeper_not_found for a client', async () => {
    const context = await buildTestApp();
    const client = await signInClient(context, 'sub-2611');

    const anonymous = await request(context.app).get('/goalkeepers/me/stats');
    const notGoalkeeper = await stats(context, client.token);

    expect(anonymous.status).toBe(401);
    expect(notGoalkeeper.status).toBe(404);
    expect(notGoalkeeper.body.error).toBe('goalkeeper_not_found');
  });

  it("422 operating_balance_not_configured when the market's country has no currency", async () => {
    const context = await buildTestApp();
    context.marketRepository.seed(testMarket({ id: 'city-limbo', name: 'Limbo', countryId: 'country-none' }));
    const noCurrency = await signInClient(context, 'sub-2621');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(noCurrency.userId, { marketId: 'city-limbo' }));

    const currency = await stats(context, noCurrency.token);

    expect(currency.status).toBe(422);
    expect(currency.body.error).toBe('operating_balance_not_configured');
  });
});
