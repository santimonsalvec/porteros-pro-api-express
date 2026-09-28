import { beforeEach, describe, expect, it } from 'vitest';
import { ListAvailableBookingsQuery } from '../../../../../src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.js';
import { ListAvailableBookingsQueryHandler } from '../../../../../src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQueryHandler.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { GoalkeeperBookingHarness, inHours, NOW } from './goalkeeperBookingHarness.js';

let h: GoalkeeperBookingHarness;
let handler: ListAvailableBookingsQueryHandler;

beforeEach(async () => {
  h = new GoalkeeperBookingHarness();
  handler = new ListAvailableBookingsQueryHandler({
    goalkeeperProfileRepository: h.profiles,
    walletRepository: h.wallet,
    commissionResolver: h.commissionResolver,
    bookingRepository: h.bookings,
    requestRepository: h.requests,
    zoneRepository: h.zones,
    cityRepository: h.cities,
    clock: h.clock,
  });
  await h.credit(50000);
});

const list = (page = 1, pageSize = 20) => handler.handle(new ListAvailableBookingsQuery('gk-1', page, pageSize));
const ids = async (page = 1, pageSize = 20) => {
  const result = await list(page, pageSize);
  return result.outcome === 'success' ? result.items.map((item) => item.bookingId) : [];
};

describe('ListAvailableBookingsQueryHandler — US1: a goalkeeper sees the matches they can take', () => {
  it('lists only bookings of enabled zones, soonest first, with earnings and commission and no client', async () => {
    h.seedRequest('norte', inHours(5), { goalkeeperCount: 1 });
    h.seedRequest('sur', inHours(3), { goalkeeperCount: 1, zoneId: 'zone-cali-sur' });
    h.seedRequest('centro', inHours(4), { goalkeeperCount: 1, zoneId: 'zone-cali-centro' });

    const result = await list();

    expect(result.outcome === 'success' && result.items.map((item) => item.bookingId)).toEqual(['sur-b1', 'norte-b1']);
    expect(result).toMatchObject({ totalItems: 2, unavailableReason: null });
    expect(result.outcome === 'success' && result.items[0]).toEqual({
      bookingId: 'sur-b1',
      requestId: 'sur',
      zoneId: 'zone-cali-sur',
      zoneName: 'Sur',
      cityId: 'city-cali',
      cityName: 'Cali',
      startsAt: inHours(3).toISOString(),
      startsAtLocal: '2026-09-25T13:00:00-05:00',
      timeZone: 'America/Bogota',
      durationMinutes: 90,
      goalkeeperCount: 1,
      earnings: 60000,
      commission: 9000,
      currency: 'COP',
    });
  });

  it('stops listing a booking at the end of its search (start − 30 min)', async () => {
    h.seedRequest('soon', inHours(0.5), { goalkeeperCount: 1 });

    h.clock.set(new Date(new Date(NOW).getTime() - 1));
    expect(await ids()).toEqual(['soon-b1']);
    h.clock.set(NOW);
    expect(await ids()).toEqual([]);
  });

  it('hides bookings that clash with a match the goalkeeper holds (18:00–19:30 + 30 min)', async () => {
    const { bookings } = h.seedRequest('held', inHours(5), { goalkeeperCount: 1 }); // 23:00Z–00:30Z
    h.assign(bookings[0]!);
    h.seedRequest('clash', inHours(6.75), { goalkeeperCount: 1 }); // 00:45Z, inside the margin
    h.seedRequest('fine', inHours(7), { goalkeeperCount: 1 }); // 01:00Z, exactly 30 min after

    expect(await ids()).toEqual(['fine-b1']);
  });

  it('only lists bookings whose commission the balance covers', async () => {
    const fresh = new GoalkeeperBookingHarness();
    await fresh.credit(8000);
    fresh.seedRequest('norte', inHours(5), { goalkeeperCount: 1 });
    fresh.seedRequest('sur', inHours(6), { goalkeeperCount: 1, zoneId: 'zone-cali-sur' });
    const freshHandler = new ListAvailableBookingsQueryHandler({
      goalkeeperProfileRepository: fresh.profiles,
      walletRepository: fresh.wallet,
      commissionResolver: fresh.commissionResolver,
      bookingRepository: fresh.bookings,
      requestRepository: fresh.requests,
      zoneRepository: fresh.zones,
      cityRepository: fresh.cities,
      clock: fresh.clock,
    });

    const result = await freshHandler.handle(new ListAvailableBookingsQuery('gk-1', 1, 20));

    expect(result.outcome === 'success' && result.items.map((item) => item.bookingId)).toEqual(['norte-b1']);
  });

  it('shows nothing, with the missing amount, when the balance is below the lowest zone commission', async () => {
    const poor = new GoalkeeperBookingHarness();
    await poor.credit(5000);
    poor.seedRequest('norte', inHours(5), { goalkeeperCount: 1 });
    const poorHandler = new ListAvailableBookingsQueryHandler({
      goalkeeperProfileRepository: poor.profiles,
      walletRepository: poor.wallet,
      commissionResolver: poor.commissionResolver,
      bookingRepository: poor.bookings,
      requestRepository: poor.requests,
      zoneRepository: poor.zones,
      cityRepository: poor.cities,
      clock: poor.clock,
    });

    expect(await poorHandler.handle(new ListAvailableBookingsQuery('gk-1', 1, 20))).toMatchObject({
      outcome: 'success',
      items: [],
      totalItems: 0,
      unavailableReason: 'insufficient_funds',
      missingAmount: 2000,
    });
  });

  it('shows nothing, with the end of the suspension, while suspended', async () => {
    const until = inHours(72);
    h.profiles.seed(Object.assign(buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-norte'] }), { suspendedUntil: until }));
    h.seedRequest('norte', inHours(5), { goalkeeperCount: 1 });

    expect(await list()).toMatchObject({ items: [], unavailableReason: 'suspended', suspendedUntil: until.toISOString() });
  });

  it('shows nothing while offers are switched off, before any other reason (feature 015)', async () => {
    h.profiles.seed(
      buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-norte'], availableForOffers: false, suspendedUntil: inHours(72) }),
    );
    h.seedRequest('norte', inHours(5), { goalkeeperCount: 1 });

    expect(await list()).toMatchObject({
      items: [],
      totalItems: 0,
      unavailableReason: 'not_available_for_offers',
      missingAmount: null,
      suspendedUntil: null,
    });
  });

  it("never lists a booking of the goalkeeper's own request", async () => {
    h.seedRequest('mine', inHours(5), { goalkeeperCount: 1, clientId: 'gk-1' });

    expect(await ids()).toEqual([]);
  });

  it('hides the other booking of a request the goalkeeper already holds', async () => {
    const { bookings } = h.seedRequest('pair', inHours(5), { goalkeeperCount: 2 });
    h.assign(bookings[0]!);

    expect(await ids()).toEqual([]);
  });

  it('pages the takeable bookings with exact totals', async () => {
    for (let i = 0; i < 5; i++) h.seedRequest(`r-${i}`, inHours(5 + i * 3), { goalkeeperCount: 1 });

    expect(await ids(1, 2)).toEqual(['r-0-b1', 'r-1-b1']);
    expect(await ids(3, 2)).toEqual(['r-4-b1']);
    expect(await list(1, 2)).toMatchObject({ totalItems: 5, totalPages: 3 });
  });

  it('refuses a user who is not an active goalkeeper', async () => {
    expect(await handler.handle(new ListAvailableBookingsQuery('someone', 1, 20))).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
