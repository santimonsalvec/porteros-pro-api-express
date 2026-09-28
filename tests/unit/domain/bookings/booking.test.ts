import { describe, expect, it } from 'vitest';
import { Booking } from '../../../../src/domain/bookings/booking.js';
import { GoalkeeperPrice } from '../../../../src/domain/bookings/goalkeeperPrice.js';
import { GoalkeeperRequest } from '../../../../src/domain/bookings/goalkeeperRequest.js';
import { buildStoredQuote } from '../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);

describe('Booking.forRequest', () => {
  it("is one goalkeeper's place in the request, at the per-goalkeeper price, awaiting assignment", () => {
    const booking = Booking.forRequest('b-1', request, createdAt);

    expect(booking).toMatchObject({
      id: 'b-1',
      requestId: 'r-1',
      clientId: request.clientId,
      zoneId: request.zoneId,
      startsAt: request.startsAt,
      status: 'pending_assignment',
      createdAt,
    });
    expect(booking.price).toEqual(new GoalkeeperPrice({ unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP' }));
  });

  it('has bookings whose totals add up to the quoted total', () => {
    const bookings = [Booking.forRequest('b-1', request, createdAt), Booking.forRequest('b-2', request, createdAt)];

    expect(bookings.reduce((sum, booking) => sum + booking.price.total, 0)).toBe(request.pricing.total);
  });

  it('rejects an unknown status when rehydrated', () => {
    const booking = Booking.forRequest('b-1', request, createdAt);

    expect(() => Booking.rehydrate({ ...booking, status: 'lost' as never })).toThrow(/status/);
  });

  it('copies the fixed commission and margin, and derives the end and the end of the search', () => {
    const booking = Booking.forRequest('b-1', request, createdAt);

    // The stored quote starts at 20:00Z, lasts 90 minutes, with a 30-minute margin and 7.000 commission.
    expect(booking).toMatchObject({
      commission: 7000,
      travelBufferMinutes: 30,
      endsAt: new Date('2026-09-21T21:30:00.000Z'),
      searchEndsAt: new Date('2026-09-21T19:30:00.000Z'),
      goalkeeperId: null,
      assignedAt: null,
    });
  });

  it('is takeable strictly before the end of its search', () => {
    const booking = Booking.forRequest('b-1', request, createdAt);

    expect(booking.isSearchOpenAt(new Date('2026-09-21T19:29:59.999Z'))).toBe(true);
    expect(booking.isSearchOpenAt(new Date('2026-09-21T19:30:00.000Z'))).toBe(false);
  });

  it('can be assigned once, only while pending', () => {
    const at = new Date('2026-09-21T18:30:00.000Z');
    const assigned = Booking.forRequest('b-1', request, createdAt).assign('gk-1', at);

    expect(assigned).toMatchObject({ status: 'assigned', goalkeeperId: 'gk-1', assignedAt: at });
    expect(() => assigned.assign('gk-2', at)).toThrow(/not pending/);
  });
});
