import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Booking } from '../../../src/domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../../src/domain/bookings/goalkeeperPrice.js';
import { City } from '../../../src/domain/locations/city.js';
import { buildRequest, buildRequestBookings } from '../../fixtures/quoteFixtures.js';
import { buildGoalkeeperProfile } from '../../fixtures/walletFixtures.js';
import { buildTestApp } from '../testAppFactory.js';
import { signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';

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

  it('422 wallet_not_configured without currency, 422 time_zone_not_configured without time zone', async () => {
    const context = await buildTestApp();
    context.cityRepository.seed(
      new City({ id: 'city-palmira', name: 'Palmira', regionId: 'region-valle', zoneCityId: null }),
    );
    const noCurrency = await signInClient(context, 'sub-2621');
    const noTimeZone = await signInClient(context, 'sub-2622');
    context.goalkeeperProfileRepository.seed(
      buildGoalkeeperProfile(noCurrency.userId, { cityId: 'city-medellin' }),
    );
    context.goalkeeperProfileRepository.seed(
      buildGoalkeeperProfile(noTimeZone.userId, { cityId: 'city-palmira' }),
    );

    const currency = await stats(context, noCurrency.token);
    const timeZone = await stats(context, noTimeZone.token);

    expect(currency.status).toBe(422);
    expect(currency.body.error).toBe('wallet_not_configured');
    expect(timeZone.status).toBe(422);
    expect(timeZone.body.error).toBe('time_zone_not_configured');
  });
});
