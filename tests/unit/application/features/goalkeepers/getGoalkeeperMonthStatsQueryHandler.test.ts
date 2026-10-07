import { beforeEach, describe, expect, it } from 'vitest';
import { GetGoalkeeperMonthStatsQuery } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQuery.js';
import { GetGoalkeeperMonthStatsQueryHandler } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQueryHandler.js';
import {
  Booking,
  type BookingAttendance,
  type BookingStatus,
} from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../../../../src/domain/bookings/goalkeeperPrice.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { buildGoalkeeperProfile, seedWalletWorld } from '../../../../fixtures/walletFixtures.js';

/** Bogotá is UTC−5 all year: local midnight of a day is 05:00Z. */
const template = buildRequestBookings(
  buildRequest('r-1', new Date('2026-10-01T20:00:00.000Z')),
)[0]!;
let counter = 0;

function booking(
  startsAt: string,
  total: number,
  overrides: Partial<{
    goalkeeperId: string;
    status: BookingStatus;
    attendance: BookingAttendance | null;
  }> = {},
): Booking {
  return Booking.rehydrate({
    ...template,
    id: `b-${++counter}`,
    startsAt: new Date(startsAt),
    endsAt: new Date(new Date(startsAt).getTime() + 3_600_000),
    price: new GoalkeeperPrice({ unitRate: total, unitSurcharge: 0, total, currency: 'COP' }),
    goalkeeperId: overrides.goalkeeperId ?? 'gk-1',
    assignedAt: new Date('2026-08-01T00:00:00.000Z'),
    status: overrides.status ?? 'completed',
    attendance: overrides.attendance === undefined ? 'attended' : overrides.attendance,
  });
}

let profiles: FakeGoalkeeperProfileRepository;
let cities: FakeCityRepository;
let bookings: FakeBookingRepository;
let clock: FixedClock;
let handler: GetGoalkeeperMonthStatsQueryHandler;

beforeEach(() => {
  profiles = new FakeGoalkeeperProfileRepository();
  cities = new FakeCityRepository();
  const regions = new FakeRegionRepository();
  const countries = new FakeCountryRepository();
  seedWalletWorld({
    cityRepository: cities,
    regionRepository: regions,
    countryRepository: countries,
  });
  bookings = new FakeBookingRepository();
  clock = new FixedClock('2026-10-07T17:00:00.000Z');
  handler = new GetGoalkeeperMonthStatsQueryHandler({
    context: {
      goalkeeperProfileRepository: profiles,
      cityRepository: cities,
      regionRepository: regions,
      countryLookup: countries,
    },
    bookingRepository: bookings,
    clock,
  });
  profiles.seed(buildGoalkeeperProfile('gk-1'));
});

const stats = async () => {
  const result = await handler.handle(new GetGoalkeeperMonthStatsQuery('gk-1'));
  if (result.outcome !== 'success') throw new Error(`unexpected ${result.outcome}`);
  return result.stats;
};

describe('GetGoalkeeperMonthStatsQueryHandler — US1: what the goalkeeper earned this month', () => {
  it('adds up the played matches of the month and compares with the previous month to the same day', async () => {
    for (let day = 1; day <= 6; day++)
      bookings.seed(booking(`2026-10-0${day}T23:00:00.000Z`, 70000));
    bookings.seed(booking('2026-10-07T01:00:00.000Z', 70000));
    bookings.seed(booking('2026-09-02T23:00:00.000Z', 300000));
    bookings.seed(booking('2026-09-07T23:00:00.000Z', 111000));
    bookings.seed(booking('2026-09-08T23:00:00.000Z', 999000));

    expect(await stats()).toEqual({
      month: { year: 2026, month: 10 },
      currency: 'COP',
      earned: 490000,
      playedCount: 7,
      averagePerMatch: 70000,
      toPlay: 0,
      previous: { month: { year: 2026, month: 9 }, throughDay: 7, earned: 411000 },
      changePercent: 19,
    });
  });

  it('leaves out no-shows, other statuses and other goalkeepers; an unsettled attendance counts', async () => {
    bookings.seed(booking('2026-10-02T23:00:00.000Z', 60000, { attendance: null }));
    bookings.seed(booking('2026-10-03T23:00:00.000Z', 60000, { attendance: 'no_show' }));
    bookings.seed(
      booking('2026-10-04T23:00:00.000Z', 60000, { status: 'cancelled', attendance: null }),
    );
    bookings.seed(
      booking('2026-10-05T23:00:00.000Z', 60000, {
        status: 'goalkeeper_withdrew',
        attendance: null,
      }),
    );
    bookings.seed(booking('2026-10-05T23:00:00.000Z', 60000, { goalkeeperId: 'gk-2' }));

    const result = await stats();

    expect(result.earned).toBe(60000);
    expect(result.playedCount).toBe(1);
  });

  it('shows a drop as a negative change, rounding halves away from zero', async () => {
    bookings.seed(booking('2026-10-02T23:00:00.000Z', 50000));
    bookings.seed(booking('2026-09-02T23:00:00.000Z', 80000));

    expect((await stats()).changePercent).toBe(-38);
  });

  it('counts every assigned booking as to play, future or past', async () => {
    bookings.seed(
      booking('2026-10-20T23:00:00.000Z', 60000, { status: 'assigned', attendance: null }),
    );
    bookings.seed(
      booking('2026-11-02T23:00:00.000Z', 60000, { status: 'assigned', attendance: null }),
    );
    bookings.seed(
      booking('2026-10-06T23:00:00.000Z', 60000, { status: 'assigned', attendance: null }),
    );
    bookings.seed(
      booking('2026-10-06T23:00:00.000Z', 60000, {
        status: 'assigned',
        attendance: null,
        goalkeeperId: 'gk-2',
      }),
    );

    expect((await stats()).toPlay).toBe(3);
  });
});

describe('GetGoalkeeperMonthStatsQueryHandler — month boundaries in the city time zone', () => {
  it('counts a match at 23:00 on the last day for that month, one at 00:00 of day 1 for the next', async () => {
    clock.set('2026-11-01T04:30:00.000Z');
    bookings.seed(booking('2026-11-01T04:00:00.000Z', 40000));
    bookings.seed(booking('2026-11-01T05:00:00.000Z', 50000));

    const result = await stats();

    expect(result.month).toEqual({ year: 2026, month: 10 });
    expect(result.earned).toBe(40000);
  });

  it('reads the month of the city, not of UTC, late at night', async () => {
    clock.set('2026-11-01T03:00:00.000Z');

    expect((await stats()).month).toEqual({ year: 2026, month: 10 });
  });

  it('ends the previous period at the local midnight after the same day', async () => {
    bookings.seed(booking('2026-09-08T04:59:00.000Z', 10000));
    bookings.seed(booking('2026-09-08T05:00:00.000Z', 20000));

    const result = await stats();

    expect(result.previous.throughDay).toBe(7);
    expect(result.previous.earned).toBe(10000);
  });

  it('compares the 31st of March with all of February', async () => {
    clock.set('2027-03-31T17:00:00.000Z');
    bookings.seed(booking('2027-02-28T23:00:00.000Z', 30000));

    const result = await stats();

    expect(result.previous).toEqual({
      month: { year: 2027, month: 2 },
      throughDay: 28,
      earned: 30000,
    });
  });

  it('goes back to December on January 1st', async () => {
    clock.set('2027-01-01T17:00:00.000Z');

    expect((await stats()).previous.month).toEqual({ year: 2026, month: 12 });
  });
});

describe('GetGoalkeeperMonthStatsQueryHandler — US3: a month with nothing yet', () => {
  it('has no average and no change when nothing was played in either period', async () => {
    const result = await stats();

    expect(result).toMatchObject({
      earned: 0,
      playedCount: 0,
      averagePerMatch: null,
      changePercent: null,
    });
  });

  it('says -100 when nothing was played yet but the previous month had earnings', async () => {
    clock.set('2026-11-01T17:00:00.000Z');
    bookings.seed(booking('2026-10-01T23:00:00.000Z', 60000));

    expect(await stats()).toMatchObject({
      earned: 0,
      averagePerMatch: null,
      changePercent: -100,
      previous: { throughDay: 1, earned: 60000 },
    });
  });
});

describe('GetGoalkeeperMonthStatsQueryHandler — refusals', () => {
  it('is not a goalkeeper without a profile', async () => {
    expect(await handler.handle(new GetGoalkeeperMonthStatsQuery('client-x'))).toEqual({
      outcome: 'not_a_goalkeeper',
    });
  });

  it('refuses a country without currency, like the wallet', async () => {
    profiles.seed(buildGoalkeeperProfile('gk-3', { cityId: 'city-orphan' }));

    expect(await handler.handle(new GetGoalkeeperMonthStatsQuery('gk-3'))).toEqual({
      outcome: 'wallet_not_configured',
      cityId: 'city-orphan',
    });
  });

  it('refuses a city without time zone', async () => {
    cities.seed(
      new City({ id: 'city-palmira', name: 'Palmira', regionId: 'region-valle', zoneCityId: null }),
    );
    profiles.seed(buildGoalkeeperProfile('gk-4', { cityId: 'city-palmira' }));

    expect(await handler.handle(new GetGoalkeeperMonthStatsQuery('gk-4'))).toEqual({
      outcome: 'time_zone_not_configured',
      cityId: 'city-palmira',
    });
  });
});
