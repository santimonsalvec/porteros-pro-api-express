import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toBookingResponse } from '../../../../../src/application/features/goalkeeperRequests/common/bookingResponse.js';
import { ListClientBookingsQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/listClientBookings/listClientBookingsQuery.js';
import { ListClientBookingsQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/listClientBookings/listClientBookingsQueryHandler.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { buildBooking } from '../../../../fixtures/quoteFixtures.js';

const NOW = '2026-09-25T18:00:00.000Z';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A start instant relative to NOW. */
const at = (offsetMs: number) => new Date(new Date(NOW).getTime() + offsetMs);

const bookingAt = buildBooking;

function zone(id: string, name: string): Zone {
  return new Zone({
    id,
    cityId: 'city-cali',
    name,
    slug: id,
    geometry: { type: 'Polygon', coordinates: [] },
    active: true,
    displayOrder: 1,
  });
}

let bookings: FakeBookingRepository;
let zones: FakeZoneRepository;
let cities: FakeCityRepository;
let clock: FixedClock;
let handler: ListClientBookingsQueryHandler;

beforeEach(() => {
  bookings = new FakeBookingRepository();
  zones = new FakeZoneRepository();
  zones.seed(zone('zone-cali-norte', 'Cali Norte'));
  cities = new FakeCityRepository();
  cities.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null }));
  clock = new FixedClock(NOW);
  handler = new ListClientBookingsQueryHandler(bookings, zones, cities, clock);
});

const list = (clientId = 'client-a', page = 1, pageSize = 20) =>
  handler.handle(new ListClientBookingsQuery(clientId, page, pageSize));

const ids = (result: Awaited<ReturnType<typeof list>>) => result.items.map((item) => item.bookingId);

describe('ListClientBookingsQueryHandler — US1: the client sees their bookings', () => {
  it('lists upcoming matches soonest first, then past matches most recent first', async () => {
    bookings.seed(bookingAt('past-5d', at(-5 * DAY)));
    bookings.seed(bookingAt('in-10d', at(10 * DAY)));
    bookings.seed(bookingAt('tomorrow', at(1 * DAY)));

    const result = await list();

    expect(ids(result)).toEqual(['tomorrow', 'in-10d', 'past-5d']);
    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
  });

  it('lists only past matches, most recent first, when nothing is upcoming', async () => {
    bookings.seed(bookingAt('past-20d', at(-20 * DAY)));
    bookings.seed(bookingAt('past-3d', at(-3 * DAY)));

    expect(ids(await list())).toEqual(['past-3d', 'past-20d']);
  });

  it('returns an empty list with zero totals for a client without bookings', async () => {
    expect(await list()).toEqual({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  });

  it('returns each booking exactly as stored, plus the current zone and city names', async () => {
    const stored = bookingAt('tomorrow', at(1 * DAY));
    bookings.seed(stored);

    const [item] = (await list()).items;

    expect(item).toEqual({ ...toBookingResponse(stored), zoneName: 'Cali Norte', cityName: 'Cali' });
    expect(item?.total).toBe(120000);
  });

  it('shows the current name of a renamed city', async () => {
    bookings.seed(bookingAt('tomorrow', at(1 * DAY)));
    cities.seed(new City({ id: 'city-cali', name: 'Santiago de Cali', regionId: 'region-valle', zoneCityId: null }));

    expect((await list()).items[0]?.cityName).toBe('Santiago de Cali');
  });

  it('still lists a booking whose zone or city no longer exists, with a null name', async () => {
    bookings.seed(bookingAt('gone-zone', at(1 * DAY), { zoneId: 'zone-deleted' }));
    bookings.seed(bookingAt('gone-city', at(2 * DAY), { cityId: 'city-deleted' }));

    const result = await list();

    expect(result.items.map(({ bookingId, zoneName, cityName }) => ({ bookingId, zoneName, cityName }))).toEqual([
      { bookingId: 'gone-zone', zoneName: null, cityName: 'Cali' },
      { bookingId: 'gone-city', zoneName: 'Cali Norte', cityName: null },
    ]);
  });

  it('breaks ties on the same start by id: ascending if upcoming, descending if past', async () => {
    bookings.seed(bookingAt('b-up', at(DAY), { zoneId: 'zone-b' }));
    bookings.seed(bookingAt('a-up', at(DAY), { zoneId: 'zone-a' }));
    bookings.seed(bookingAt('a-past', at(-DAY), { zoneId: 'zone-a' }));
    bookings.seed(bookingAt('b-past', at(-DAY), { zoneId: 'zone-b' }));

    expect(ids(await list())).toEqual(['a-up', 'b-up', 'b-past', 'a-past']);
  });

  it('counts a match starting exactly now as upcoming', async () => {
    bookings.seed(bookingAt('past', at(-HOUR)));
    bookings.seed(bookingAt('starts-now', at(0)));

    expect(ids(await list())).toEqual(['starts-now', 'past']);
  });

  it('reads the clock once, so counts and reads agree on every segment', async () => {
    bookings.seed(bookingAt('soon', at(HOUR)));
    const now = vi.spyOn(clock, 'now');

    await list();

    expect(now).toHaveBeenCalledTimes(1);
  });

  it('does not resolve names for an empty page', async () => {
    const zoneLookup = vi.spyOn(zones, 'getManyByIds');
    const cityLookup = vi.spyOn(cities, 'getByIds');

    await list();

    expect(zoneLookup).not.toHaveBeenCalled();
    expect(cityLookup).not.toHaveBeenCalled();
  });

  it('changes nothing: the stored bookings are the same before and after listing', async () => {
    bookings.seed(bookingAt('tomorrow', at(DAY)));
    const before = bookings.all();

    await list();

    expect(bookings.all()).toEqual(before);
  });
});

describe('ListClientBookingsQueryHandler — US2: never another client’s bookings', () => {
  it("lists only the caller's bookings, and counts only theirs", async () => {
    bookings.seed(bookingAt('a-1', at(DAY)));
    bookings.seed(bookingAt('a-2', at(-DAY)));
    for (let i = 0; i < 5; i++) {
      // Same starts as A's, so a filter on time alone would leak them.
      bookings.seed(bookingAt(`b-${i}`, at(i % 2 === 0 ? DAY : -DAY), { clientId: 'client-b', zoneId: `zone-b-${i}` }));
    }

    const result = await list('client-a');

    expect(ids(result)).toEqual(['a-1', 'a-2']);
    expect(result).toMatchObject({ totalItems: 2, totalPages: 1 });
  });

  it("never shows B's bookings on any of A's pages", async () => {
    for (let i = 0; i < 5; i++) bookings.seed(bookingAt(`a-${i}`, at((i - 2) * DAY), { zoneId: `zone-a-${i}` }));
    for (let i = 0; i < 5; i++) bookings.seed(bookingAt(`b-${i}`, at((i - 2) * DAY), { clientId: 'client-b', zoneId: `zone-b-${i}` }));

    const seen: string[] = [];
    for (let page = 1; page <= 5; page++) seen.push(...ids(await list('client-a', page, 1)));

    expect(seen.sort()).toEqual(['a-0', 'a-1', 'a-2', 'a-3', 'a-4']);
  });
});

describe('ListClientBookingsQueryHandler — US3: page by page', () => {
  /** N bookings, about a third upcoming, each at a distinct start (hours apart) and zone. */
  function seedMany(count: number): string[] {
    const upcoming = Math.floor(count / 3);
    const expected: { id: string; startsAt: Date }[] = [];
    for (let i = 0; i < count; i++) {
      const offset = i < upcoming ? (i + 1) * HOUR : -(i - upcoming + 1) * HOUR;
      const id = `bk-${String(i).padStart(3, '0')}`;
      bookings.seed(bookingAt(id, at(offset), { zoneId: `zone-${i}` }));
      expected.push({ id, startsAt: at(offset) });
    }
    const up = expected.filter((b) => b.startsAt >= at(0)).sort((a, b) => +a.startsAt - +b.startsAt);
    const past = expected.filter((b) => b.startsAt < at(0)).sort((a, b) => +b.startsAt - +a.startsAt);
    return [...up, ...past].map((b) => b.id);
  }

  for (const count of [0, 1, 20, 21, 45]) {
    for (const size of [1, 7, 20, 50]) {
      it(`walks ${count} bookings at page size ${size}: each exactly once, in order, with constant totals`, async () => {
        const expected = seedMany(count);
        const totalPages = Math.ceil(count / size);

        const seen: string[] = [];
        for (let page = 1; page <= totalPages; page++) {
          const result = await list('client-a', page, size);
          expect(result).toMatchObject({ page, pageSize: size, totalItems: count, totalPages });
          expect(result.items.length).toBe(page < totalPages ? size : count - size * (totalPages - 1));
          seen.push(...ids(result));
        }

        expect(seen).toEqual(expected);
      });
    }
  }

  it('fills a page straddling the boundary with the last upcoming, then the most recent past', async () => {
    bookings.seed(bookingAt('up-1', at(1 * HOUR)));
    bookings.seed(bookingAt('up-2', at(2 * HOUR)));
    bookings.seed(bookingAt('up-3', at(3 * HOUR)));
    bookings.seed(bookingAt('past-1', at(-1 * HOUR)));
    bookings.seed(bookingAt('past-2', at(-2 * HOUR)));

    expect(ids(await list('client-a', 2, 2))).toEqual(['up-3', 'past-1']);
  });

  it('serves 45 bookings as 20, 20 and 5, then an empty page 4 with the real totals', async () => {
    seedMany(45);

    const sizes = [];
    for (let page = 1; page <= 4; page++) {
      const result = await list('client-a', page, 20);
      expect(result).toMatchObject({ totalItems: 45, totalPages: 3 });
      sizes.push(result.items.length);
    }

    expect(sizes).toEqual([20, 20, 5, 0]);
  });
});
