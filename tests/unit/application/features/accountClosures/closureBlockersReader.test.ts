import { describe, expect, it } from 'vitest';
import { ClosureBlockersReader } from '../../../../../src/application/features/accountClosures/common/closureBlockersReader.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';

const clock = new FixedClock('2026-10-14T15:00:00.000Z');
const zone = { id: 'z-1', name: 'Cali Norte' };
const booking = (id: string, requestId: string, startsAt: string) => ({ id, requestId, zoneId: 'z-1', startsAt: new Date(startsAt) });

function reader(overrides: Record<string, unknown> = {}) {
  return new ClosureBlockersReader({
    bookings: { findAssignedToGoalkeeper: async () => [] },
    requests: { findByIds: async () => [], findUpcomingForClient: async () => [] },
    zones: { getManyByIds: async () => [zone] as never },
    deposits: { findPendingForGoalkeeper: async () => [] },
    cases: { findOpenForParticipant: async () => [] },
    clock,
    ...overrides,
  } as never);
}

describe('ClosureBlockersReader (feature 029)', () => {
  it('lists a goalkeeper’s accepted matches in order, with the local time and the zone', async () => {
    const result = await reader({
      bookings: { findAssignedToGoalkeeper: async () => [booking('b-2', 'r-2', '2026-10-20T00:00:00Z'), booking('b-1', 'r-1', '2026-10-18T00:00:00Z')] },
      requests: {
        findByIds: async () => [
          { id: 'r-1', match: { startsAtLocal: '2026-10-17T19:00:00-05:00' } },
          { id: 'r-2', match: { startsAtLocal: '2026-10-19T19:00:00-05:00' } },
        ],
        findUpcomingForClient: async () => [],
      },
    }).forUser('gk-1', 'goalkeeper');

    expect(result).toEqual([
      { code: 'assigned_bookings', bookingId: 'b-1', startsAtLocal: '2026-10-17T19:00:00-05:00', placeName: 'Cali Norte' },
      { code: 'assigned_bookings', bookingId: 'b-2', startsAtLocal: '2026-10-19T19:00:00-05:00', placeName: 'Cali Norte' },
    ]);
  });

  it('adds the pending deposits and the open cases', async () => {
    const result = await reader({
      deposits: { findPendingForGoalkeeper: async () => [{ id: 'd-1', amount: 20000, currency: 'COP' }] },
      cases: { findOpenForParticipant: async () => [{ id: 'case-1', type: 'goalkeeper_no_show' }] },
    }).forUser('gk-1', 'goalkeeper');

    expect(result).toEqual([
      { code: 'pending_deposits', depositId: 'd-1', amount: 20000, currency: 'COP' },
      { code: 'open_cases', caseId: 'case-1', type: 'goalkeeper_no_show' },
    ]);
  });

  it('lists a client’s upcoming requests, and never asks about deposits', async () => {
    let askedDeposits = false;
    const result = await reader({
      requests: { findByIds: async () => [], findUpcomingForClient: async () => [{ id: 'r-9', match: { zoneId: 'z-1', startsAtLocal: '2026-10-18T19:00:00-05:00' } }] },
      deposits: { findPendingForGoalkeeper: async () => { askedDeposits = true; return []; } },
    }).forUser('client-1', 'client');

    expect(result).toEqual([{ code: 'assigned_bookings', bookingId: 'r-9', startsAtLocal: '2026-10-18T19:00:00-05:00', placeName: 'Cali Norte' }]);
    expect(askedDeposits).toBe(false);
  });

  it('answers nothing for a user with nothing pending', async () => {
    expect(await reader().forUser('gk-1', 'goalkeeper')).toEqual([]);
  });
});
