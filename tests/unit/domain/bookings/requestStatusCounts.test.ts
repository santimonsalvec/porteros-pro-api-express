import { describe, expect, it } from 'vitest';
import { Booking, type BookingStatus } from '../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../src/domain/bookings/goalkeeperRequest.js';
import { countsOf, requestStatusFromCounts, requestStatusOf } from '../../../../src/domain/bookings/requestStatus.js';
import { bookingStatusCombinations } from '../../../fixtures/bookingStatusCombinations.js';
import { buildStoredQuote } from '../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);

const withStatuses = (statuses: BookingStatus[]) =>
  statuses.map((status, index) => Booking.rehydrate({ ...Booking.forRequest(`b-${index}`, request, createdAt), status }));

describe('the request status from booking counts (admin spec 006, research §6)', () => {
  it('counts the bookings that decide the status', () => {
    expect(countsOf(withStatuses(['pending_assignment', 'assigned', 'assigned', 'goalkeeper_withdrew']))).toEqual({
      pending: 1,
      assigned: 2,
      completed: 0,
      cancelled: 0,
      expired: 0,
    });
  });

  it('covers every combination of up to 3 bookings', () => {
    expect(bookingStatusCombinations()).toHaveLength(6 + 21 + 56);
  });

  it.each(bookingStatusCombinations().map((statuses) => [statuses.join(','), statuses] as const))(
    'agrees with requestStatusOf for %s',
    (_label, statuses) => {
      const bookings = withStatuses(statuses);
      expect(requestStatusFromCounts(countsOf(bookings))).toBe(requestStatusOf(bookings));
    },
  );
});
