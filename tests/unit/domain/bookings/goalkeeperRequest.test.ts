import { describe, expect, it } from 'vitest';
import { GoalkeeperRequest } from '../../../../src/domain/bookings/goalkeeperRequest.js';
import { buildStoredQuote } from '../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');

describe('GoalkeeperRequest', () => {
  it("copies the quote's client, id, match, price and free-cancellation period, and starts active", () => {
    const quote = buildStoredQuote();

    const request = GoalkeeperRequest.fromQuote('r-1', quote, 'cancel_all', createdAt);

    expect(request).toMatchObject({
      id: 'r-1',
      clientId: quote.clientId,
      quoteId: quote.id,
      match: quote.match,
      pricing: quote.pricing,
      partialFulfillment: 'cancel_all',
      freeCancellationMinutes: quote.freeCancellationMinutes,
      active: true,
      quoteIssuedAt: quote.issuedAt,
      createdAt,
    });
    expect(request.zoneId).toBe(quote.match.zoneId);
    expect(request.startsAt).toEqual(quote.match.startsAt);
    expect(request.goalkeeperCount).toBe(2);
  });

  it('rejects an unknown partial-fulfillment preference', () => {
    expect(() =>
      GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'all' as never, createdAt),
    ).toThrow(/partialFulfillment/);
  });

  describe('free cancellation', () => {
    // Starts 20:00Z; 60 minutes of free-cancellation period → free until 19:00Z.
    const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);

    it('ends the free-cancellation period minutes before the start', () => {
      expect(request.freeCancellationUntil()).toEqual(new Date('2026-09-21T19:00:00.000Z'));
    });

    it('is still free exactly at the boundary and no longer 1 ms after', () => {
      expect(request.canCancelFreeAt(new Date('2026-09-21T19:00:00.000Z'))).toBe(true);
      expect(request.canCancelFreeAt(new Date('2026-09-21T19:00:00.001Z'))).toBe(false);
    });
  });
});
