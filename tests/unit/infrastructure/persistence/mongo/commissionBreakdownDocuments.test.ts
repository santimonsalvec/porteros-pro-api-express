import { describe, expect, it } from 'vitest';
import { bookingFromDocument, bookingToDocument, breakdownFromDocument, breakdownToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { requestFromDocument, requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { quoteFromDocument, quoteToDocument } from '../../../../../src/infrastructure/persistence/mongo/quoteRepository.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { CommissionBreakdown } from '../../../../../src/domain/operatingBalance/commissionRule.js';
import { buildStoredQuote } from '../../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const own = new CommissionBreakdown({ base: 60000, percentBps: 500, percentAmount: 3000, fixedAmount: 0, net: 3000, ruleId: 'c-g', origin: { scope: 'goalkeeper', refId: 'gk-1' }, modality: 'futbol_11', matchModality: 'futbol_11' });

describe('commission breakdown documents (feature 033)', () => {
  it('round-trips a breakdown', () => {
    expect(breakdownFromDocument(breakdownToDocument(own))).toEqual(own);
    expect(breakdownToDocument(own)).toEqual({ base: 60000, percentBps: 500, percentAmount: 3000, fixedAmount: 0, net: 3000, ruleId: 'c-g', origin: { scope: 'goalkeeper', refId: 'gk-1' }, modality: 'futbol_11', matchModality: 'futbol_11' });
  });

  it('reads an absent document as null (records written before the feature)', () => {
    expect(breakdownFromDocument(undefined)).toBeNull();
    expect(breakdownFromDocument(null)).toBeNull();
  });

  it('round-trips through a quote, a request and a booking, and omits the field when there is none', () => {
    const quote = buildStoredQuote();
    expect(quoteFromDocument(quoteToDocument(quote)).commissionBreakdown).toEqual(quote.commissionBreakdown);
    const request = GoalkeeperRequest.fromQuote('r-1', quote, 'keep_confirmed', createdAt);
    expect(requestFromDocument(requestToDocument(request)).commissionBreakdown).toEqual(quote.commissionBreakdown);
    const booking = Booking.forRequest('b-1', request, createdAt).assign('gk-1', createdAt, 'verified', own);
    const doc = bookingToDocument(booking);
    expect(doc.commission).toBe(3000);
    expect(bookingFromDocument(doc).commissionBreakdown).toEqual(own);

    const legacy = bookingToDocument(Booking.rehydrate({ ...booking, commissionBreakdown: null }));
    expect('commissionBreakdown' in legacy).toBe(false);
    expect(bookingFromDocument(legacy).commissionBreakdown).toBeNull();
  });
});
