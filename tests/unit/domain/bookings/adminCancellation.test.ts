import { describe, expect, it } from 'vitest';
import {
  Booking,
  leftTheRequest,
  normalizeAdminCancellationReason,
  type BookingEndedBy,
} from '../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../src/domain/bookings/goalkeeperRequest.js';
import { buildStoredQuote } from '../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);
const pending = Booking.forRequest('b-1', request, createdAt);
const endedAt = new Date('2026-09-22T12:00:00.000Z');

function cancelledBy(by: BookingEndedBy | null): Booking {
  return Booking.rehydrate({ ...pending, status: by ? 'cancelled' : 'pending_assignment', endedAt: by ? endedAt : null, cancelledBy: by });
}

describe('a booking cancelled by an administrator (admin spec 006)', () => {
  it('keeps the reason, who cancelled and the staff member', () => {
    const booking = Booking.rehydrate({
      ...pending,
      status: 'cancelled',
      endedAt,
      endReason: 'admin_cancelled',
      cancelledBy: 'admin',
      cancellationNote: 'La cancha cerró por lluvia',
      cancelledByStaffId: 'staff-user-1',
    });

    expect(booking).toMatchObject({
      endReason: 'admin_cancelled',
      cancelledBy: 'admin',
      cancellationNote: 'La cancha cerró por lluvia',
      cancelledByStaffId: 'staff-user-1',
    });
  });

  it('has no staff member when none was stored (older documents and every other path)', () => {
    expect(pending.cancelledByStaffId).toBeNull();
    expect(Booking.rehydrate({ ...pending, cancelledByStaffId: undefined }).cancelledByStaffId).toBeNull();
  });
});

describe('leftTheRequest', () => {
  it('is true for the bookings the client or an administrator cancelled', () => {
    expect(leftTheRequest(cancelledBy('client'))).toBe(true);
    expect(leftTheRequest(cancelledBy('admin'))).toBe(true);
  });

  it('is false for the system, a goalkeeper who withdrew and a live booking', () => {
    expect(leftTheRequest(cancelledBy('system'))).toBe(false);
    expect(leftTheRequest(cancelledBy('goalkeeper'))).toBe(false);
    expect(leftTheRequest(cancelledBy(null))).toBe(false);
  });
});

describe('normalizeAdminCancellationReason', () => {
  it('trims the reason', () => {
    expect(normalizeAdminCancellationReason('  La cancha cerró  ')).toBe('La cancha cerró');
  });

  it('accepts 3 and 300 characters', () => {
    expect(normalizeAdminCancellationReason('abc')).toBe('abc');
    expect(normalizeAdminCancellationReason('a'.repeat(300))).toHaveLength(300);
  });

  it('refuses a blank, short or long reason', () => {
    expect(() => normalizeAdminCancellationReason('   ')).toThrow(/3 and 300/);
    expect(() => normalizeAdminCancellationReason('ab')).toThrow(/3 and 300/);
    expect(() => normalizeAdminCancellationReason(' ab ')).toThrow(/3 and 300/);
    expect(() => normalizeAdminCancellationReason('a'.repeat(301))).toThrow(/3 and 300/);
  });
});
