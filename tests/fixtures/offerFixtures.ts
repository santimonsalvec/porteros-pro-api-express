import { Booking, type BookingProps } from '../../src/domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../src/domain/bookings/goalkeeperPrice.js';
import type { OfferSnapshot } from '../../src/domain/bookings/offerEligibility.js';

/** 13:00 in Bogotá; the default match starts 3 hours later (search open until 30 min before). */
export const OFFER_NOW = new Date('2026-10-04T18:00:00.000Z');

/** A pending booking for one goalkeeper, 90 minutes, commission 7.000 COP, zone Bello. */
export function buildBooking(overrides: Partial<BookingProps> = {}): Booking {
  const startsAt = overrides.startsAt ?? new Date('2026-10-04T21:00:00.000Z');
  return Booking.rehydrate({
    id: 'booking-1',
    requestId: 'request-1',
    clientId: 'client-1',
    zoneId: 'zone-bello',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    status: 'pending_assignment',
    price: new GoalkeeperPrice({ unitRate: 40000, unitSurcharge: 0, total: 40000, currency: 'COP' }),
    commission: 7000,
    travelBufferMinutes: 30,
    searchEndsAt: new Date(startsAt.getTime() - 30 * 60_000),
    goalkeeperId: null,
    assignedAt: null,
    createdAt: new Date('2026-10-04T17:00:00.000Z'),
    ...overrides,
  });
}

/** A goalkeeper who can take any pending Bello booking with commission ≤ 20.000. */
export function eligibleSnapshot(overrides: Partial<OfferSnapshot> = {}): OfferSnapshot {
  return {
    goalkeeperId: 'goalkeeper-1',
    zoneIds: ['zone-bello'],
    availableForOffers: true,
    suspendedUntil: null,
    balance: 20000,
    canSeeOffers: true,
    vatRateBps: 0,
    held: [],
    ...overrides,
  };
}
