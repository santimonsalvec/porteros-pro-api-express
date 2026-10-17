import { describe, expect, it } from 'vitest';
import { Booking } from '../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../src/domain/bookings/goalkeeperRequest.js';
import { Quote } from '../../../../src/domain/bookings/quote.js';
import { CommissionBreakdown } from '../../../../src/domain/operatingBalance/commissionRule.js';
import { buildStoredQuote } from '../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const at = new Date('2026-09-21T18:30:00.000Z');
const reference = new CommissionBreakdown({ base: 60000, percentBps: 0, percentAmount: 0, fixedAmount: 7000, net: 7000, ruleId: 'commission-country-co', origin: { scope: 'country', refId: 'country-co' }, modality: null });
const own = new CommissionBreakdown({ base: 60000, percentBps: 500, percentAmount: 3000, fixedAmount: 0, net: 3000, ruleId: 'c-g', origin: { scope: 'goalkeeper', refId: 'gk-1' }, modality: null });

describe('the commission breakdown travels from the quote to the request and its bookings (feature 033)', () => {
  it('the quote keeps the reference breakdown and its net as the commission', () => {
    const quote = buildStoredQuote();
    expect(quote.commission).toBe(7000);
    expect(quote.commissionBreakdown).toEqual(reference);
  });

  it('a quote, a request or a booking whose commission is not the breakdown’s net is corrupt', () => {
    const quote = buildStoredQuote();
    expect(() => Quote.rehydrate({ ...quote, commission: 7001 })).toThrow(/commissionBreakdown\.net/);
    const request = GoalkeeperRequest.fromQuote('r-1', quote, 'keep_confirmed', createdAt);
    expect(() => GoalkeeperRequest.rehydrate({ ...request, commission: 7001 })).toThrow(/commissionBreakdown\.net/);
    const booking = Booking.forRequest('b-1', request, createdAt);
    expect(() => Booking.rehydrate({ ...booking, commission: 7001 })).toThrow(/commissionBreakdown\.net/);
  });

  it('a record written before the feature has no breakdown and still rehydrates', () => {
    const quote = buildStoredQuote();
    expect(Quote.rehydrate({ ...quote, commissionBreakdown: null }).commissionBreakdown).toBeNull();
    const request = GoalkeeperRequest.fromQuote('r-1', Quote.rehydrate({ ...quote, commissionBreakdown: null }), 'keep_confirmed', createdAt);
    expect(request.commissionBreakdown).toBeNull();
    expect(Booking.forRequest('b-1', request, createdAt).commissionBreakdown).toBeNull();
  });

  it('the request copies the quote’s and each booking copies the request’s', () => {
    const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);
    expect(request.commissionBreakdown).toEqual(reference);
    const booking = Booking.forRequest('b-1', request, createdAt);
    expect(booking.commissionBreakdown).toEqual(reference);
    expect(booking.commission).toBe(7000);
  });

  it('a replacement goes back to the request’s reference commission when the withdrawn goalkeeper had their own', () => {
    const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);
    const assigned = Booking.forRequest('b-1', request, createdAt).assign('gk-1', at, 'verified', own);
    const replacement = Booking.replacementFor(assigned, 'b-2', 'gk-1', at, request);
    expect(replacement.commission).toBe(7000);
    expect(replacement.commissionBreakdown).toEqual(reference);
    // Without the request at hand, the original's commission is all there is.
    expect(Booking.replacementFor(assigned, 'b-3', 'gk-1', at).commission).toBe(3000);
    // A reference commission is kept as is, request or not.
    const plain = Booking.forRequest('b-4', request, createdAt).assign('gk-2', at);
    expect(Booking.replacementFor(plain, 'b-5', 'gk-2', at, request).commissionBreakdown).toEqual(reference);
  });
});

describe('Booking.assign with the goalkeeper’s own breakdown (feature 033, FR-015)', () => {
  const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);
  const pending = () => Booking.forRequest('b-1', request, createdAt);

  it('without one, the reference commission stays', () => {
    const booking = pending().assign('gk-1', at, 'verified');
    expect(booking.commission).toBe(7000);
    expect(booking.commissionBreakdown).toEqual(reference);
  });

  it('with one, the booking carries the goalkeeper’s net and breakdown', () => {
    const booking = pending().assign('gk-1', at, 'verified', own);
    expect(booking.commission).toBe(3000);
    expect(booking.commissionBreakdown).toEqual(own);
  });

  it('refuses an effective breakdown built on another base', () => {
    const other = new CommissionBreakdown({ ...own, base: 50000, percentAmount: 2500, net: 2500 });
    expect(() => pending().assign('gk-1', at, 'verified', other)).toThrow(/base/);
  });

  it('caps the unverified discount with the effective net, not the reference one', () => {
    const discounted = GoalkeeperRequest.rehydrate({ ...request, unverifiedDiscountBps: 10000 });
    const withReference = Booking.forRequest('b-1', discounted, createdAt).assign('gk-1', at, 'validated');
    const withOwn = Booking.forRequest('b-1', discounted, createdAt).assign('gk-1', at, 'validated', own);
    // Earnings never fall below the commission: 60.000 − 7.000 with the reference, 60.000 − 3.000 with their own.
    expect(withReference.price.discount).toBe(53000);
    expect(withOwn.price.discount).toBe(57000);
  });
});
