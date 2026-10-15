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

describe('Booking.replacementFor (feature 018)', () => {
  const at = new Date('2026-09-21T18:30:00.000Z');
  const withdrawn = Booking.forRequest('b-1', request, createdAt).assign('gk-1', createdAt);

  it('is the same place of the match, pending, excluding the goalkeeper who withdrew', () => {
    const replacement = Booking.replacementFor(withdrawn, 'b-2', 'gk-1', at);

    expect(replacement).toMatchObject({
      id: 'b-2',
      requestId: withdrawn.requestId,
      clientId: withdrawn.clientId,
      zoneId: withdrawn.zoneId,
      startsAt: withdrawn.startsAt,
      endsAt: withdrawn.endsAt,
      commission: withdrawn.commission,
      travelBufferMinutes: withdrawn.travelBufferMinutes,
      searchEndsAt: withdrawn.searchEndsAt,
      status: 'pending_assignment',
      goalkeeperId: null,
      assignedAt: null,
      createdAt: at,
      replacesBookingId: 'b-1',
      excludedGoalkeeperIds: ['gk-1'],
    });
    expect(replacement.price).toEqual(withdrawn.price);
  });

  it('keeps excluding earlier goalkeepers when a replacement is itself replaced', () => {
    const first = Booking.replacementFor(withdrawn, 'b-2', 'gk-1', at).assign('gk-2', at);
    const second = Booking.replacementFor(first, 'b-3', 'gk-2', at);

    expect(second.excludedGoalkeeperIds).toEqual(['gk-1', 'gk-2']);
    expect(second.replacesBookingId).toBe('b-2');
  });

  it('measures the notice of a withdrawal in whole minutes, never below zero', () => {
    // The match starts at 20:00Z.
    expect(withdrawn.withdrawalNoticeMinutes(new Date('2026-09-21T18:00:00.000Z'))).toBe(120);
    expect(withdrawn.withdrawalNoticeMinutes(new Date('2026-09-21T18:00:30.000Z'))).toBe(119);
    expect(withdrawn.withdrawalNoticeMinutes(new Date('2026-09-21T20:05:00.000Z'))).toBe(0);
  });

  it('defaults the new fields on older bookings', () => {
    expect(withdrawn.replacesBookingId).toBeNull();
    expect(withdrawn.excludedGoalkeeperIds).toEqual([]);
    expect(withdrawn.dismissedGoalkeeperIds).toEqual([]);
  });

  it('carries who dismissed the match to its replacement (feature 024)', () => {
    const dismissed = Booking.rehydrate({ ...withdrawn, dismissedGoalkeeperIds: ['gk-9'] });

    const replacement = Booking.replacementFor(dismissed, 'b-2', 'gk-1', at);

    expect(replacement.dismissedGoalkeeperIds).toEqual(['gk-9']);
    expect(replacement.isClosedTo('gk-9')).toBe(true);
    expect(replacement.isClosedTo('gk-1')).toBe(true);
    expect(replacement.isClosedTo('gk-2')).toBe(false);
  });
});

describe('verified-first phases (admin spec 030)', () => {
  const optedIn = GoalkeeperRequest.fromQuote('r-2', buildStoredQuote(), 'keep_confirmed', createdAt, true);

  it('a request records whether the client accepts goalkeepers without the seal (off by default)', () => {
    expect(request.acceptsUnverified).toBe(false);
    expect(request.unverifiedDiscountBps).toBe(0);
    expect(optedIn.acceptsUnverified).toBe(true);
  });

  it('copies the opt-in and opens to unverified goalkeepers after the priority window', () => {
    const booking = Booking.forRequest('b-1', optedIn, createdAt, 15);

    expect(booking.acceptsUnverified).toBe(true);
    expect(booking.unverifiedDiscountBps).toBe(0);
    expect(booking.verifiedOnlyUntil).toEqual(new Date(createdAt.getTime() + 15 * 60_000));
  });

  it('never keeps the window open past the end of the search', () => {
    // The search ends at 19:30Z; 18:01Z + 120 min would be 20:01Z.
    expect(Booking.forRequest('b-1', optedIn, createdAt, 120).verifiedOnlyUntil).toEqual(new Date('2026-09-21T19:30:00.000Z'));
  });

  it('without a window it opens right away', () => {
    expect(Booking.forRequest('b-1', optedIn, createdAt).verifiedOnlyUntil).toEqual(createdAt);
  });

  it('a replacement keeps the opt-in, the discount and the window of the original', () => {
    const original = Booking.forRequest('b-1', optedIn, createdAt, 15).assign('gk-1', createdAt);
    const replacement = Booking.replacementFor(original, 'b-2', 'gk-1', new Date('2026-09-21T18:20:00.000Z'));

    expect(replacement).toMatchObject({ acceptsUnverified: true, unverifiedDiscountBps: 0, verifiedOnlyUntil: original.verifiedOnlyUntil });
  });

  it('reads a booking stored before 030 as verified-only from its creation, without discount', () => {
    const older: Record<string, unknown> = { ...Booking.forRequest('b-1', optedIn, createdAt, 15) };
    for (const field of ['acceptsUnverified', 'unverifiedDiscountBps', 'verifiedOnlyUntil']) delete older[field];
    const read = Booking.rehydrate(older as unknown as Parameters<typeof Booking.rehydrate>[0]);

    expect(read).toMatchObject({ acceptsUnverified: false, unverifiedDiscountBps: 0, verifiedOnlyUntil: createdAt });
  });
});

describe('Booking.assign by vetting tier (admin spec 030)', () => {
  const discounted = Booking.rehydrate({ ...Booking.forRequest('b-1', request, createdAt), acceptsUnverified: true, unverifiedDiscountBps: 1000 });
  const at = new Date('2026-09-21T18:30:00.000Z');

  it('a verified goalkeeper takes it at the full price', () => {
    const assigned = discounted.assign('gk-1', at, 'verified');

    expect(assigned.price.total).toBe(60000);
    expect(assigned.price.discount).toBe(0);
    expect(assigned.goalkeeperVerified).toBe(true);
  });

  it('a validated goalkeeper without the seal takes it with the discount, the commission unchanged', () => {
    const assigned = discounted.assign('gk-1', at, 'validated');

    expect(assigned.price).toMatchObject({ unitRate: 55000, unitSurcharge: 5000, discount: 6000, total: 54000 });
    expect(assigned.commission).toBe(discounted.commission);
    expect(assigned.goalkeeperVerified).toBe(false);
  });

  it('a pending booking has no goalkeeper to describe', () => {
    expect(discounted.goalkeeperVerified).toBeNull();
  });

  it('a replacement goes back to the full price, to be discounted again if needed', () => {
    const replacement = Booking.replacementFor(discounted.assign('gk-1', at, 'validated'), 'b-2', 'gk-1', at);

    expect(replacement.price.discount).toBe(0);
    expect(replacement.price.total).toBe(60000);
    expect(replacement.goalkeeperVerified).toBeNull();
  });
});
