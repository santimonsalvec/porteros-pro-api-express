import { describe, expect, it } from 'vitest';
import { clashes, firstConflict, holdsSameRequest, type Commitment } from '../../../../src/domain/bookings/schedulePolicy.js';

/** A match on 2026-09-28 from HH:MM for `minutes`, with a travel margin. */
function match(id: string, start: string, minutes: number, margin = 30, requestId = `r-${id}`): Commitment {
  const startsAt = new Date(`2026-09-28T${start}:00.000Z`);
  return { id, requestId, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000), travelBufferMinutes: margin };
}

const held = match('held', '18:00', 90); // 18:00–19:30

describe('schedulePolicy — US3: a goalkeeper can only hold matches they can reach', () => {
  it.each<[string, Commitment, boolean]>([
    ['starts at 19:45, inside the 30-minute margin after 19:30', match('c', '19:45', 90), true],
    ['starts at 20:00, exactly 30 minutes after 19:30', match('c', '20:00', 90), false],
    ['starts at 16:00 and ends 17:30, exactly 30 minutes before 18:00', match('c', '16:00', 90), false],
    ['ends at 17:40, inside the margin before 18:00', match('c', '16:10', 90), true],
    ['overlaps directly', match('c', '18:30', 60), true],
    ['is the next day', match('c', '23:59', 60), false],
  ])('a match that %s clashes: %s', (_label, candidate, expected) => {
    expect(clashes(candidate, held)).toBe(expected);
    expect(clashes(held, candidate)).toBe(expected);
  });

  it('uses the larger margin of the two, symmetrically', () => {
    const wideMargin = match('c', '20:00', 90, 45); // 20:00 is 30 min after 19:30, but its city needs 45
    expect(clashes(wideMargin, held)).toBe(true);
    expect(clashes(held, wideMargin)).toBe(true);
  });

  it('finds the first held booking that clashes, ignoring the candidate itself', () => {
    const later = match('later', '22:00', 60);
    expect(firstConflict(match('c', '19:45', 60), [later, held])?.id).toBe('held');
    expect(firstConflict(match('c', '20:00', 60), [later, held])).toBeNull();
    expect(firstConflict(held, [held])).toBeNull();
  });

  it('knows when the goalkeeper already holds a booking of the same request', () => {
    const sameMatch = match('other-booking', '18:00', 90, 30, 'r-held');
    expect(holdsSameRequest(sameMatch, [held])).toBe(true);
    expect(holdsSameRequest(match('c', '22:00', 60), [held])).toBe(false);
  });
});
