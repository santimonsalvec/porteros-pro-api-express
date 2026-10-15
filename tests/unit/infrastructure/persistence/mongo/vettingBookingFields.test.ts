import { describe, expect, it } from 'vitest';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { bookingFromDocument, bookingToDocument } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { requestFromDocument, requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { buildStoredQuote } from '../../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const plain = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);
const optedIn = GoalkeeperRequest.fromQuote('r-2', buildStoredQuote(), 'keep_confirmed', createdAt, true);

describe('admin spec 030 fields in requests and bookings', () => {
  it('a request without the opt-in keeps the stored shape of before; with it, it round-trips', () => {
    expect(requestToDocument(plain)).not.toHaveProperty('acceptsUnverified');
    expect(requestToDocument(plain)).not.toHaveProperty('unverifiedDiscountBps');

    const read = requestFromDocument(requestToDocument(optedIn));
    expect(read.acceptsUnverified).toBe(true);
    expect(read.unverifiedDiscountBps).toBe(0);
  });

  it('a booking with the defaults keeps the stored shape of before', () => {
    const doc = bookingToDocument(Booking.forRequest('b-1', plain, createdAt));

    expect(doc).not.toHaveProperty('acceptsUnverified');
    expect(doc).not.toHaveProperty('unverifiedDiscountBps');
    expect(doc).not.toHaveProperty('verifiedOnlyUntil');
    expect(bookingFromDocument(doc).verifiedOnlyUntil).toEqual(createdAt);
  });

  it('a booking with the opt-in and a window round-trips', () => {
    const booking = Booking.forRequest('b-1', optedIn, createdAt, 15);
    const doc = bookingToDocument(booking);

    expect(doc).toMatchObject({ acceptsUnverified: true, verifiedOnlyUntil: booking.verifiedOnlyUntil });
    expect(bookingFromDocument(doc)).toMatchObject({ acceptsUnverified: true, unverifiedDiscountBps: 0, verifiedOnlyUntil: booking.verifiedOnlyUntil });
  });
});

describe('a discounted assignment in the stored booking (admin spec 030)', () => {
  it('keeps the discount and whether the goalkeeper had the seal; a full price keeps its shape', () => {
    const pending = Booking.rehydrate({ ...Booking.forRequest('b-1', optedIn, createdAt), unverifiedDiscountBps: 1000 });
    const at = new Date('2026-09-21T18:30:00.000Z');

    const full = bookingToDocument(pending.assign('gk-1', at, 'verified'));
    expect(full.price).not.toHaveProperty('discount');
    expect(full.goalkeeperVerified).toBe(true);

    const discounted = bookingToDocument(pending.assign('gk-1', at, 'validated'));
    expect(discounted.price).toMatchObject({ discount: 6000, total: 54000 });
    const read = bookingFromDocument(discounted);
    expect(read.price.discount).toBe(6000);
    expect(read.goalkeeperVerified).toBe(false);
    expect(bookingToDocument(pending)).not.toHaveProperty('goalkeeperVerified');
  });
});
