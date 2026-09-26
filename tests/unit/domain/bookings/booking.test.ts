import { describe, expect, it } from 'vitest';
import { Booking } from '../../../../src/domain/bookings/booking.js';
import { Quote } from '../../../../src/domain/bookings/quote.js';
import { MatchDetails } from '../../../../src/domain/bookings/matchDetails.js';
import { PricingSnapshot } from '../../../../src/domain/bookings/pricingSnapshot.js';

const match = new MatchDetails({
  latitude: 3.45,
  longitude: -76.5,
  zoneId: 'zone-cali-norte',
  cityId: 'city-cali',
  startsAt: new Date('2026-09-21T20:00:00.000Z'),
  startsAtLocal: '2026-09-21T15:00:00-05:00',
  timeZone: 'America/Bogota',
  goalkeeperCount: 2,
  durationMinutes: 90,
});
const pricing = new PricingSnapshot(
  {
    unitRate: 55000,
    subtotal: 110000,
    unitSurcharge: 5000,
    surcharge: 10000,
    total: 120000,
    currency: 'COP',
  },
  2,
);

describe('Booking.fromQuote', () => {
  it("copies the quote's client, match and price and starts awaiting assignment", () => {
    const quote = Quote.issue(
      'q-1',
      'client-1',
      match,
      pricing,
      new Date('2026-09-21T18:00:00.000Z'),
      3,
    );
    const createdAt = new Date('2026-09-21T18:01:00.000Z');

    const booking = Booking.fromQuote('b-1', quote, createdAt);

    expect(booking).toMatchObject({
      id: 'b-1',
      clientId: 'client-1',
      quoteId: 'q-1',
      status: 'pending_assignment',
      match,
      pricing,
      quoteIssuedAt: quote.issuedAt,
      createdAt,
    });
    expect(booking.zoneId).toBe('zone-cali-norte');
    expect(booking.startsAt).toEqual(new Date('2026-09-21T20:00:00.000Z'));
  });
});
