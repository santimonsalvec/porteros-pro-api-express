import { describe, expect, it } from 'vitest';
import { commissionOf, isEligible } from '../../../../src/domain/bookings/offerEligibility.js';
import { CommissionBreakdown } from '../../../../src/domain/operatingBalance/commissionRule.js';
import { CommissionSetting } from '../../../../src/domain/operatingBalance/commissionSetting.js';
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
    ['withdrew from the booking this one replaces', eligibleSnapshot(), buildBooking({ replacesBookingId: 'b-0', excludedGoalkeeperIds: ['goalkeeper-1'] })],
    ['dismissed the match ("No me interesa", feature 024)', eligibleSnapshot(), buildBooking({ dismissedGoalkeeperIds: ['goalkeeper-1'] })],
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

describe('isEligible by vetting tier (admin spec 030)', () => {
  const windowEnd = new Date(OFFER_NOW.getTime() + 10 * 60_000);
  const openToUnverified = buildBooking({ acceptsUnverified: true, verifiedOnlyUntil: windowEnd });

  it('never offers anything to an unvalidated goalkeeper', () => {
    expect(isEligible(eligibleSnapshot({ tier: 'unvalidated' }), openToUnverified, windowEnd)).toBe(false);
  });

  it('offers to a validated goalkeeper only when the client accepted it, once the window ended', () => {
    const validated = eligibleSnapshot({ tier: 'validated' });

    expect(isEligible(validated, buildBooking({ verifiedOnlyUntil: OFFER_NOW }), OFFER_NOW)).toBe(false);
    expect(isEligible(validated, openToUnverified, OFFER_NOW)).toBe(false);
    expect(isEligible(validated, openToUnverified, new Date(windowEnd.getTime() - 1))).toBe(false);
    expect(isEligible(validated, openToUnverified, windowEnd)).toBe(true);
  });

  it('a verified goalkeeper is offered as before, window or not', () => {
    expect(isEligible(eligibleSnapshot({ tier: 'verified' }), openToUnverified, OFFER_NOW)).toBe(true);
    expect(isEligible(eligibleSnapshot({ tier: 'verified' }), booking, OFFER_NOW)).toBe(true);
  });
});

describe('commissionOf — what the booking costs this goalkeeper (feature 033)', () => {
  const priced = buildBooking({
    commissionBreakdown: new CommissionBreakdown({ base: 40000, percentBps: 0, percentAmount: 0, fixedAmount: 7000, net: 7000, ruleId: 'c-co', origin: { scope: 'country', refId: 'country-co' }, modality: null, matchModality: 'futbol_11' }),
  });
  const own = (percentBps: number, modality: string | null = null) =>
    new CommissionSetting({ id: `own-${percentBps}-${modality}`, scope: 'goalkeeper', refId: 'goalkeeper-1', fixedAmount: 0, percentBps, modality, countryId: 'country-co' });

  it('is the stored commission without own rules, and the own rule on the base with them', () => {
    expect(commissionOf(eligibleSnapshot(), priced)).toBe(7000);
    expect(commissionOf(eligibleSnapshot({ ownRules: [own(500)] }), priced)).toBe(2000);
  });

  it('prefers the own rule of the match modality, then the general one', () => {
    expect(commissionOf(eligibleSnapshot({ ownRules: [own(500), own(300, 'futbol_11')] }), priced)).toBe(1200);
    expect(commissionOf(eligibleSnapshot({ ownRules: [own(300, 'micro_futsal')] }), priced)).toBe(7000);
  });

  it('makes an otherwise unaffordable booking eligible when the own rule is cheaper', () => {
    expect(isEligible(eligibleSnapshot({ balance: 6999 }), priced, OFFER_NOW)).toBe(false);
    expect(isEligible(eligibleSnapshot({ balance: 6999, ownRules: [own(500)] }), priced, OFFER_NOW)).toBe(true);
  });
});
