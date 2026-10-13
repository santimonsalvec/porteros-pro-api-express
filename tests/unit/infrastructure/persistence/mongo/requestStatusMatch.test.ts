import { describe, expect, it } from 'vitest';
import { Booking, type BookingStatus } from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { countsOf, requestStatusFromCounts, type RequestStatus } from '../../../../../src/domain/bookings/requestStatus.js';
import { statusMatch } from '../../../../../src/infrastructure/persistence/mongo/requestAdminPipelines.js';
import { bookingStatusCombinations } from '../../../../fixtures/bookingStatusCombinations.js';
import { matchesDocument } from '../../../../fakes/fakeMongoMatch.js';
import { buildStoredQuote } from '../../../../fixtures/quoteFixtures.js';

const createdAt = new Date('2026-09-21T18:01:00.000Z');
const request = GoalkeeperRequest.fromQuote('r-1', buildStoredQuote(), 'keep_confirmed', createdAt);
const STATUSES: RequestStatus[] = ['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed'];

const countsFor = (statuses: BookingStatus[]) =>
  countsOf(statuses.map((status, index) => Booking.rehydrate({ ...Booking.forRequest(`b-${index}`, request, createdAt), status })));

describe('statusMatch (admin spec 006, research §6)', () => {
  it.each(bookingStatusCombinations().map((statuses) => [statuses.join(','), statuses] as const))(
    'selects %s exactly under its own status',
    (_label, statuses) => {
      const counts = countsFor(statuses);
      const expected = requestStatusFromCounts(counts);
      for (const status of STATUSES) {
        expect(matchesDocument(statusMatch(status), { ...counts }), status).toBe(status === expected);
      }
    },
  );

  it('selects a request without bookings as closed', () => {
    const none = { pending: 0, assigned: 0, completed: 0, cancelled: 0, expired: 0 };
    expect(STATUSES.filter((status) => matchesDocument(statusMatch(status), none))).toEqual(['closed']);
  });
});
