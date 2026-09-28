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
});
