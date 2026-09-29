import { describe, expect, it } from 'vitest';
import { Booking } from '../../../../src/domain/bookings/booking.js';
import { completionRound, contactsVisibleAt, contactsVisibleFrom, isRequestComplete } from '../../../../src/domain/bookings/contactVisibility.js';
import { buildRequest, buildRequestBookings } from '../../../fixtures/quoteFixtures.js';

const start = new Date('2026-10-04T20:00:00.000Z');
const request = buildRequest('r-1', start, { goalkeeperCount: 2, freeCancellationMinutes: 60 });
const [first, second] = buildRequestBookings(request) as [Booking, Booking];
const at = new Date('2026-10-04T12:00:00.000Z');

describe('contact visibility (feature 019)', () => {
  it('shows contacts from the end of free cancellation (start − 60 min), inclusive', () => {
    expect(contactsVisibleFrom(request)).toEqual(new Date('2026-10-04T19:00:00.000Z'));
    expect(contactsVisibleAt(request, new Date('2026-10-04T18:59:59.999Z'))).toBe(false);
    expect(contactsVisibleAt(request, new Date('2026-10-04T19:00:00.000Z'))).toBe(true);
  });

  it('is complete when nothing is searching and someone is assigned', () => {
    const assigned = first.assign('gk-1', at);
    expect(isRequestComplete([assigned, second])).toBe(false);
    expect(isRequestComplete([assigned, second.assign('gk-2', at)])).toBe(true);
    const cancelled = Booking.rehydrate({ ...second, status: 'cancelled', cancelledBy: 'client' });
    const withdrawn = Booking.rehydrate({ ...second, status: 'goalkeeper_withdrew', goalkeeperId: 'gk-2', assignedAt: at });
    expect(isRequestComplete([assigned, cancelled])).toBe(true);
    expect(isRequestComplete([assigned, withdrawn])).toBe(true);
    expect(isRequestComplete([cancelled])).toBe(false);
  });

  it('names the round by the latest replacement', () => {
    expect(completionRound([first, second])).toBeNull();
    const held = first.assign('gk-1', at);
    const r1 = Booking.replacementFor(held, 'b-r1', 'gk-1', new Date('2026-10-04T13:00:00.000Z'));
    const r2 = Booking.replacementFor(r1.assign('gk-2', at), 'b-r2', 'gk-2', new Date('2026-10-04T14:00:00.000Z'));
    expect(completionRound([first, r1, r2])).toBe('b-r2');
  });
});
