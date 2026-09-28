import { describe, expect, it } from 'vitest';
import { Booking, type BookingStatus } from '../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../src/domain/bookings/goalkeeperRequest.js';
import { requestStatusOf } from '../../../../src/domain/bookings/requestStatus.js';
import { buildStoredQuote } from '../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);

const withStatuses = (...statuses: BookingStatus[]) =>
  statuses.map((status, index) => Booking.rehydrate({ ...Booking.forRequest(`b-${index}`, request, createdAt), status }));

describe('requestStatusOf', () => {
  it.each([
    [['pending_assignment', 'pending_assignment'], 'searching'],
    [['pending_assignment', 'cancelled'], 'searching'],
    [['assigned', 'pending_assignment'], 'partially_assigned'],
    [['assigned', 'assigned'], 'assigned'],
    [['assigned', 'expired'], 'assigned'],
    [['completed', 'goalkeeper_withdrew'], 'completed'],
    // Feature 016: requests that ended without a goalkeeper say how.
    [['cancelled', 'expired'], 'cancelled'],
    [['cancelled', 'cancelled'], 'cancelled'],
    [['expired', 'expired'], 'expired'],
    [['expired'], 'expired'],
    [['goalkeeper_withdrew'], 'closed'],
  ] as [BookingStatus[], string][])('%j → %s', (statuses, expected) => {
    expect(requestStatusOf(withStatuses(...statuses))).toBe(expected);
  });
});
