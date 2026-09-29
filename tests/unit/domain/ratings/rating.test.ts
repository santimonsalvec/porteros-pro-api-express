import { describe, expect, it } from 'vitest';
import { Booking } from '../../../../src/domain/bookings/booking.js';
import { Rating, normalizeRatingComment, ratingWindowFor } from '../../../../src/domain/ratings/rating.js';
import { buildBooking } from '../../../fixtures/offerFixtures.js';

const base = buildBooking(); // 21:00Z → 22:30Z
const at = (iso: string) => new Date(iso);
const assigned = Booking.rehydrate({ ...base, status: 'assigned', goalkeeperId: 'g', assignedAt: at('2026-10-04T12:00:00.000Z') });
const completed = Booking.rehydrate({ ...assigned, status: 'completed', completedAt: base.endsAt });
const checkedIn = Booking.rehydrate({
  ...assigned,
  checkIn: { at: at('2026-10-04T20:50:00.000Z'), imageId: 'i', photoUrl: 'u', location: null, distanceMeters: null },
});

describe('ratings (feature 021)', () => {
  it('validates stars and trims the comment', () => {
    const props = { id: 'r', bookingId: 'b', requestId: 'q', side: 'client' as const, authorId: 'c', subjectId: 'g', answer: true, stars: 5, comment: '  Bien ', createdAt: at('2026-10-05T00:00:00.000Z') };
    expect(Rating.create(props).comment).toBe('Bien');
    expect(() => Rating.create({ ...props, stars: 6 })).toThrow(/stars/);
    expect(() => Rating.create({ ...props, stars: 0 })).toThrow(/stars/);
    expect(normalizeRatingComment('   ')).toBeNull();
    expect(() => normalizeRatingComment('x'.repeat(501))).toThrow(/500/);
  });

  it('opens for both once completed, until 7 days after the end', () => {
    expect(ratingWindowFor(completed, 'client', at('2026-10-05T00:00:00.000Z'))).toEqual({ ok: true, dueUntil: at('2026-10-11T22:30:00.000Z') });
    expect(ratingWindowFor(completed, 'goalkeeper', at('2026-10-11T22:30:00.000Z')).ok).toBe(true);
    expect(ratingWindowFor(completed, 'goalkeeper', at('2026-10-11T22:30:00.001Z'))).toEqual({ ok: false, reason: 'expired' });
  });

  it('opens for the client at the check-in, not for the goalkeeper', () => {
    expect(ratingWindowFor(checkedIn, 'client', at('2026-10-04T21:10:00.000Z')).ok).toBe(true);
    expect(ratingWindowFor(checkedIn, 'goalkeeper', at('2026-10-04T21:10:00.000Z'))).toEqual({ ok: false, reason: 'not_finished' });
    expect(ratingWindowFor(assigned, 'client', at('2026-10-04T21:10:00.000Z'))).toEqual({ ok: false, reason: 'not_finished' });
  });

  it('never opens for a booking without its goalkeeper', () => {
    expect(ratingWindowFor(Booking.rehydrate({ ...assigned, status: 'goalkeeper_withdrew' }), 'client', at('2026-10-05T00:00:00.000Z'))).toEqual({
      ok: false,
      reason: 'no_goalkeeper',
    });
    expect(ratingWindowFor(base, 'client', at('2026-10-05T00:00:00.000Z'))).toEqual({ ok: false, reason: 'no_goalkeeper' });
  });
});
