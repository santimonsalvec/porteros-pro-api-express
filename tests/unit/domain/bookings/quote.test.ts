import { describe, expect, it } from 'vitest';
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
  goalkeeperCount: 1,
  durationMinutes: 60,
});
const pricing = new PricingSnapshot(
  {
    unitRate: 40000,
    subtotal: 40000,
    unitSurcharge: 0,
    surcharge: 0,
    total: 40000,
    currency: 'COP',
  },
  1,
);
const issuedAt = new Date('2026-09-21T18:00:00.000Z');

describe('Quote', () => {
  it('expires exactly the validity period after it is issued', () => {
    const quote = Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 60, 7000, 30);

    expect(quote.expiresAt.getTime() - quote.issuedAt.getTime()).toBe(180_000);
    expect(quote).toMatchObject({
      id: 'q-1',
      clientId: 'client-1',
      status: 'pending',
      match,
      pricing,
    });
  });

  it('is confirmable strictly before its expiry and expired from the expiry instant on', () => {
    const quote = Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 60, 7000, 30);

    expect(quote.isExpiredAt(new Date(quote.expiresAt.getTime() - 1))).toBe(false);
    expect(quote.isExpiredAt(quote.expiresAt)).toBe(true);
    expect(quote.isExpiredAt(new Date(quote.expiresAt.getTime() + 1))).toBe(true);
  });

  it('refuses a quote without a client', () => {
    expect(() => Quote.issue('q-1', '', match, pricing, issuedAt, 3, 60, 7000, 30)).toThrow();
  });

  it('keeps the free-cancellation period it was issued with', () => {
    expect(Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 45, 7000, 30).freeCancellationMinutes).toBe(45);
  });

  it('rejects a negative or fractional free-cancellation period', () => {
    expect(() => Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, -1, 7000, 30)).toThrow();
    expect(() => Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 1.5, 7000, 30)).toThrow();
  });

  it('carries the commission and the travel margin fixed at quote time', () => {
    const quote = Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 60, 9000, 45);

    expect(quote).toMatchObject({ commission: 9000, travelBufferMinutes: 45 });
  });

  it('rejects a non-positive commission and a negative travel margin', () => {
    expect(() => Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 60, 0, 30)).toThrow(/commission/);
    expect(() => Quote.issue('q-1', 'client-1', match, pricing, issuedAt, 3, 60, 7000, -1)).toThrow(/travelBufferMinutes/);
  });
});
