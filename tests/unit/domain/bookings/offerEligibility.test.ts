import { describe, expect, it } from 'vitest';
import { isEligible } from '../../../../src/domain/bookings/offerEligibility.js';
import { buildBooking, eligibleSnapshot, OFFER_NOW } from '../../../fixtures/offerFixtures.js';

const booking = buildBooking();
const later = (hours: number) => new Date(booking.startsAt.getTime() + hours * 3_600_000);

describe('isEligible', () => {
  it('accepts a goalkeeper who can take the booking now', () => {
    expect(isEligible(eligibleSnapshot(), booking, OFFER_NOW)).toBe(true);
  });

  it.each([
    ['availability switched off', eligibleSnapshot({ availableForOffers: false }), booking],
    ['suspended until after now', eligibleSnapshot({ suspendedUntil: later(24) }), booking],
    ['cannot see offers (short of the lowest commission)', eligibleSnapshot({ canSeeOffers: false }), booking],
    ['balance below this commission', eligibleSnapshot({ balance: 6999 }), booking],
    ['zone not enabled', eligibleSnapshot({ zoneIds: ['zone-copacabana'] }), booking],
    ['booking already assigned', eligibleSnapshot(), buildBooking({ status: 'assigned', goalkeeperId: 'x', assignedAt: OFFER_NOW })],
    ['booking cancelled', eligibleSnapshot(), buildBooking({ status: 'cancelled' })],
    ['search already ended', eligibleSnapshot(), buildBooking({ searchEndsAt: OFFER_NOW })],
    ['own request', eligibleSnapshot({ goalkeeperId: 'client-1' }), booking],
    [
      'already holds a booking of the same request',
      eligibleSnapshot({ held: [buildBooking({ id: 'booking-2', status: 'assigned', goalkeeperId: 'goalkeeper-1', assignedAt: OFFER_NOW })] }),
      booking,
    ],
    [
      'holds a clashing match',
      eligibleSnapshot({
        held: [buildBooking({ id: 'other', requestId: 'request-2', startsAt: later(1), status: 'assigned', goalkeeperId: 'goalkeeper-1', assignedAt: OFFER_NOW })],
      }),
      booking,
    ],
  ])('refuses when %s', (_label, snapshot, candidate) => {
    expect(isEligible(snapshot, candidate, OFFER_NOW)).toBe(false);
  });

  it('accepts once a suspension has ended, and with a match far enough apart', () => {
    const held = [buildBooking({ id: 'other', requestId: 'request-2', startsAt: later(3), status: 'assigned', goalkeeperId: 'goalkeeper-1', assignedAt: OFFER_NOW })];
    expect(isEligible(eligibleSnapshot({ suspendedUntil: OFFER_NOW, held }), booking, OFFER_NOW)).toBe(true);
  });

  it('accepts a balance exactly equal to the commission', () => {
    expect(isEligible(eligibleSnapshot({ balance: 7000 }), booking, OFFER_NOW)).toBe(true);
  });
});
