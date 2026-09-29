import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toRequestResponse } from '../../../../../src/application/features/goalkeeperRequests/common/requestResponse.js';
import { ListClientRequestsQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQuery.js';
import { ListClientRequestsQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQueryHandler.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../../../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { User } from '../../../../../src/domain/users/user.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';

const NOW = '2026-09-25T18:00:00.000Z';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A start instant relative to NOW. */
const at = (offsetMs: number) => new Date(new Date(NOW).getTime() + offsetMs);

const requestAt = buildRequest;

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

let requests: FakeGoalkeeperRequestRepository;
let bookings: FakeBookingRepository;
let zones: FakeZoneRepository;
let cities: FakeCityRepository;
let users: FakeUserRepository;
let clock: FixedClock;
let handler: ListClientRequestsQueryHandler;

beforeEach(() => {
  requests = new FakeGoalkeeperRequestRepository();
  bookings = new FakeBookingRepository();
  zones = new FakeZoneRepository();
  zones.seed(zone('zone-cali-norte', 'Cali Norte'));
  cities = new FakeCityRepository();
  cities.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null }));
  users = new FakeUserRepository();
  clock = new FixedClock(NOW);
  handler = new ListClientRequestsQueryHandler(requests, bookings, zones, cities, users, clock);
});

const list = (clientId = 'client-a', page = 1, pageSize = 20) =>
  handler.handle(new ListClientRequestsQuery(clientId, page, pageSize));

/** Stores the request and its bookings, as a confirmation would. */
function seed(request: ReturnType<typeof requestAt>) {
  requests.seed(request);
  buildRequestBookings(request).forEach((booking) => bookings.seed(booking));
  return request;
}

const ids = (result: Awaited<ReturnType<typeof list>>) => result.items.map((item) => item.requestId);

describe('ListClientRequestsQueryHandler — US1: the client sees their bookings', () => {
  it('lists upcoming matches soonest first, then past matches most recent first', async () => {
    seed(requestAt('past-5d', at(-5 * DAY)));
    seed(requestAt('in-10d', at(10 * DAY)));
    seed(requestAt('tomorrow', at(1 * DAY)));

    const result = await list();

    expect(ids(result)).toEqual(['tomorrow', 'in-10d', 'past-5d']);
    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
  });

  it('lists only past matches, most recent first, when nothing is upcoming', async () => {
    seed(requestAt('past-20d', at(-20 * DAY)));
    seed(requestAt('past-3d', at(-3 * DAY)));

    expect(ids(await list())).toEqual(['past-3d', 'past-20d']);
  });

  it('returns an empty list with zero totals for a client without bookings', async () => {
    expect(await list()).toEqual({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  });

  it('returns each booking exactly as stored, plus the current zone and city names', async () => {
    const stored = seed(requestAt('tomorrow', at(1 * DAY)));

    const [item] = (await list()).items;

    expect(item).toEqual({
      ...toRequestResponse(stored, buildRequestBookings(stored), new Date(NOW)),
      zoneName: 'Cali Norte',
      cityName: 'Cali',
    });
    expect(item?.total).toBe(120000);
  });

  it('shows the current name of a renamed city', async () => {
    seed(requestAt('tomorrow', at(1 * DAY)));
    cities.seed(new City({ id: 'city-cali', name: 'Santiago de Cali', regionId: 'region-valle', zoneCityId: null }));

    expect((await list()).items[0]?.cityName).toBe('Santiago de Cali');
  });

  it('still lists a booking whose zone or city no longer exists, with a null name', async () => {
    seed(requestAt('gone-zone', at(1 * DAY), { zoneId: 'zone-deleted' }));
    seed(requestAt('gone-city', at(2 * DAY), { cityId: 'city-deleted' }));

    const result = await list();

    expect(result.items.map(({ requestId, zoneName, cityName }) => ({ requestId, zoneName, cityName }))).toEqual([
      { requestId: 'gone-zone', zoneName: null, cityName: 'Cali' },
      { requestId: 'gone-city', zoneName: 'Cali Norte', cityName: null },
    ]);
  });

  it('breaks ties on the same start by id: ascending if upcoming, descending if past', async () => {
    seed(requestAt('b-up', at(DAY), { zoneId: 'zone-b' }));
    seed(requestAt('a-up', at(DAY), { zoneId: 'zone-a' }));
    seed(requestAt('a-past', at(-DAY), { zoneId: 'zone-a' }));
    seed(requestAt('b-past', at(-DAY), { zoneId: 'zone-b' }));

    expect(ids(await list())).toEqual(['a-up', 'b-up', 'b-past', 'a-past']);
  });

  it('counts a match starting exactly now as upcoming', async () => {
    seed(requestAt('past', at(-HOUR)));
    seed(requestAt('starts-now', at(0)));

    expect(ids(await list())).toEqual(['starts-now', 'past']);
  });

  it('reads the clock once, so counts and reads agree on every segment', async () => {
    seed(requestAt('soon', at(HOUR)));
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

  it('changes nothing: the stored requests and bookings are the same before and after listing', async () => {
    seed(requestAt('tomorrow', at(DAY)));
    const before = [requests.all(), bookings.all()];

    await list();

    expect([requests.all(), bookings.all()]).toEqual(before);
  });
});

describe('ListClientRequestsQueryHandler — US2: never another client’s bookings', () => {
  it("lists only the caller's bookings, and counts only theirs", async () => {
    seed(requestAt('a-1', at(DAY)));
    seed(requestAt('a-2', at(-DAY)));
    for (let i = 0; i < 5; i++) {
      // Same starts as A's, so a filter on time alone would leak them.
      seed(requestAt(`b-${i}`, at(i % 2 === 0 ? DAY : -DAY), { clientId: 'client-b', zoneId: `zone-b-${i}` }));
    }

    const result = await list('client-a');

    expect(ids(result)).toEqual(['a-1', 'a-2']);
    expect(result).toMatchObject({ totalItems: 2, totalPages: 1 });
  });

  it("never shows B's bookings on any of A's pages", async () => {
    for (let i = 0; i < 5; i++) seed(requestAt(`a-${i}`, at((i - 2) * DAY), { zoneId: `zone-a-${i}` }));
    for (let i = 0; i < 5; i++) seed(requestAt(`b-${i}`, at((i - 2) * DAY), { clientId: 'client-b', zoneId: `zone-b-${i}` }));

    const seen: string[] = [];
    for (let page = 1; page <= 5; page++) seen.push(...ids(await list('client-a', page, 1)));

    expect(seen.sort()).toEqual(['a-0', 'a-1', 'a-2', 'a-3', 'a-4']);
  });
});

describe('ListClientRequestsQueryHandler — US3: page by page', () => {
  /** N bookings, about a third upcoming, each at a distinct start (hours apart) and zone. */
  function seedMany(count: number): string[] {
    const upcoming = Math.floor(count / 3);
    const expected: { id: string; startsAt: Date }[] = [];
    for (let i = 0; i < count; i++) {
      const offset = i < upcoming ? (i + 1) * HOUR : -(i - upcoming + 1) * HOUR;
      const id = `bk-${String(i).padStart(3, '0')}`;
      seed(requestAt(id, at(offset), { zoneId: `zone-${i}` }));
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
    seed(requestAt('up-1', at(1 * HOUR)));
    seed(requestAt('up-2', at(2 * HOUR)));
    seed(requestAt('up-3', at(3 * HOUR)));
    seed(requestAt('past-1', at(-1 * HOUR)));
    seed(requestAt('past-2', at(-2 * HOUR)));

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

describe('ListClientRequestsQueryHandler — US5: one item per match, with its bookings', () => {
  it('returns one item per request, each with only its own bookings in id order and its derived status', async () => {
    const tomorrow = seed(requestAt('tomorrow', at(DAY)));
    seed(requestAt('in-10d', at(10 * DAY), { goalkeeperCount: 1 }));
    seed(requestAt('past', at(-DAY)));
    const [first] = buildRequestBookings(tomorrow);
    bookings.seed(Booking.rehydrate({ ...first!, status: 'assigned' }));

    const result = await list();

    expect(result).toMatchObject({ totalItems: 3, totalPages: 1 });
    expect(result.items.map((item) => [item.requestId, item.status, item.bookings.map((booking) => booking.bookingId)])).toEqual([
      ['tomorrow', 'partially_assigned', ['tomorrow-b1', 'tomorrow-b2']],
      ['in-10d', 'searching', ['in-10d-b1']],
      ['past', 'searching', ['past-b1', 'past-b2']],
    ]);
    expect(result.items[0]!.bookings[0]).toMatchObject({ unitRate: 55000, unitSurcharge: 5000, total: 60000 });
  });

  it('loads the bookings of a page with one read, and none for an empty page', async () => {
    const findByRequestIds = vi.spyOn(bookings, 'findByRequestIds');
    for (let i = 0; i < 5; i++) seed(requestAt(`r-${i}`, at((i + 1) * HOUR), { zoneId: `zone-${i}` }));

    await list('client-a', 1, 3);
    await list('client-a', 9, 3);

    expect(findByRequestIds).toHaveBeenCalledTimes(1);
    expect(findByRequestIds).toHaveBeenCalledWith(['r-0', 'r-1', 'r-2']);
  });

  for (const count of [0, 1, 20, 21, 45]) {
    it(`walks ${count} mixed 1- and 2-goalkeeper requests: each exactly once, with all its bookings`, async () => {
      for (let i = 0; i < count; i++) {
        const offset = i % 3 === 0 ? (i + 1) * HOUR : -(i + 1) * HOUR;
        seed(requestAt(`req-${String(i).padStart(3, '0')}`, at(offset), { zoneId: `zone-${i}`, goalkeeperCount: i % 2 === 0 ? 1 : 2 }));
      }

      for (const size of [1, 7, 20, 50]) {
        const seen: string[] = [];
        let bookingCount = 0;
        for (let page = 1; page <= Math.ceil(count / size); page++) {
          const result = await list('client-a', page, size);
          expect(result).toMatchObject({ totalItems: count, totalPages: Math.ceil(count / size) });
          for (const item of result.items) {
            seen.push(item.requestId);
            expect(item.bookings).toHaveLength(item.goalkeeperCount);
            bookingCount += item.bookings.length;
          }
        }
        expect(new Set(seen).size).toBe(count);
        expect(bookingCount).toBe(bookings.all().length);
      }
    });
  }
});

describe('ListClientRequestsQueryHandler — 012 US5: the assigned goalkeeper\'s contact', () => {
  function goalkeeper(id: string, firstName: string, whatsAppNumber: string): void {
    const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
    user.completeProfile(firstName, 'Portero', '+57', whatsAppNumber);
    users.seed(user);
  }

  it('shows name and WhatsApp on the assigned booking and null on the pending one, with one user read per page', async () => {
    goalkeeper('gk-1', 'Camilo', '3001234567');
    goalkeeper('gk-2', 'David', '3007654321');
    // The pair starts within the hour (contacts visible); the single one in 2 days (hidden, feature 019).
    const pair = requestAt('r-pair', at(HOUR / 2), { goalkeeperCount: 2 });
    const single = requestAt('r-single', at(2 * DAY), { zoneId: 'zone-2' });
    seed(pair);
    seed(single);
    const [taken] = bookings.all().filter((booking) => booking.requestId === 'r-pair');
    bookings.seed(taken!.assign('gk-1', at(-HOUR)));
    const [other] = bookings.all().filter((booking) => booking.requestId === 'r-single');
    bookings.seed(other!.assign('gk-2', at(-HOUR)));
    const getByIds = vi.spyOn(users, 'getByIds');

    const result = await list();

    const pairItem = result.items.find((item) => item.requestId === 'r-pair')!;
    expect(pairItem.status).toBe('partially_assigned');
    const assigned = pairItem.bookings.find((booking) => booking.bookingId === taken!.id)!;
    const pending = pairItem.bookings.find((booking) => booking.bookingId !== taken!.id)!;
    expect(assigned).toMatchObject({
      status: 'assigned',
      goalkeeper: { firstName: 'Camilo', lastName: 'Portero', whatsApp: '+57 3001234567' },
      assignedAt: at(-HOUR).toISOString(),
    });
    expect(Object.keys(assigned.goalkeeper!).sort()).toEqual(['firstName', 'lastName', 'whatsApp']);
    expect(pending).toMatchObject({ status: 'pending_assignment', goalkeeper: null, assignedAt: null });
    const singleItem = result.items.find((item) => item.requestId === 'r-single')!;
    expect(singleItem.bookings[0]).toMatchObject({ status: 'assigned', goalkeeper: null });
    expect(singleItem.contactsVisibleFrom).toBe(new Date(at(2 * DAY).getTime() - HOUR).toISOString());
    expect(getByIds).toHaveBeenCalledTimes(1);
    expect(getByIds.mock.calls[0]![0].sort()).toEqual(['gk-1', 'gk-2']);
  });

  it('reads no users when nothing is assigned', async () => {
    seed(requestAt('r-open', at(DAY)));
    const getByIds = vi.spyOn(users, 'getByIds');

    const result = await list();

    expect(result.items[0]!.bookings[0]).toMatchObject({ goalkeeper: null, assignedAt: null });
    expect(getByIds).not.toHaveBeenCalled();
  });
});
