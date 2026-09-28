import { describe, expect, it } from 'vitest';
import {
  GoalkeeperIncident,
  suspensionEndOf,
  type GoalkeeperIncidentProps,
  type Penalty,
} from '../../../../src/domain/goalkeepers/goalkeeperIncident.js';

const now = new Date('2026-09-21T18:30:00.000Z');
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

function penalty(kind: Penalty['kind'], endsInHours: number, reversal: Penalty['reversal'] = null): Penalty {
  return { id: `${kind}-${endsInHours}`, kind, days: 3, startsAt: at(-1), endsAt: at(endsInHours), reversal };
}

function incident(overrides: Partial<GoalkeeperIncidentProps> = {}): GoalkeeperIncident {
  return GoalkeeperIncident.rehydrate({
    id: 'w-1',
    kind: 'withdrawal',
    goalkeeperId: 'gk-1',
    bookingId: 'b-1',
    requestId: 'r-1',
    startsAt: at(2),
    occurredAt: at(-1),
    noticeMinutes: 90,
    late: true,
    reason: null,
    replacementBookingId: null,
    penalties: [],
    moneyReversal: null,
    forgivenAt: null,
    ...overrides,
  });
}

const decision = { by: 'admin-1', at: now, reason: 'Incapacidad médica' };

describe('GoalkeeperIncident and the suspension end (feature 018)', () => {
  it('ends the suspension at the latest penalty in force, never at a sum', () => {
    const incidents = [
      incident({ penalties: [penalty('late', 72), penalty('weekly_limit', 168)] }),
      incident({ id: 'w-2', penalties: [penalty('late', 100)] }),
    ];

    expect(suspensionEndOf(incidents, now)).toEqual(at(168));
  });

  it('ignores lifted and finished penalties', () => {
    const incidents = [incident({ penalties: [penalty('late', -1), penalty('weekly_limit', 168, decision)] })];

    expect(suspensionEndOf(incidents, now)).toBeNull();
    expect(suspensionEndOf([], now)).toBeNull();
  });

  it('counts toward the limit until forgiven', () => {
    expect(incident().countsTowardLimit()).toBe(true);
    expect(incident({ forgivenAt: now }).countsTowardLimit()).toBe(false);
  });

  it('reverses the money once and lifts every penalty, forgiving the incident', () => {
    const original = incident({ penalties: [penalty('late', 72)] });
    const { incident: reversed, changed } = original.reverse(decision, { refund: { amount: 7000, currency: 'COP' }, liftSuspension: true });

    expect(changed).toBe(true);
    expect(reversed.moneyReversal).toEqual({ ...decision, amount: 7000, currency: 'COP' });
    expect(reversed.penalties[0]!.reversal).toEqual(decision);
    expect(reversed.forgivenAt).toEqual(now);

    const again = reversed.reverse({ ...decision, at: at(1) }, { refund: { amount: 7000, currency: 'COP' }, liftSuspension: true });
    expect(again.changed).toBe(false);
    expect(again.incident).toBe(reversed);
  });

  it('reverses only what is asked', () => {
    const original = incident({ penalties: [penalty('late', 72)] });
    const moneyOnly = original.reverse(decision, { refund: { amount: 7000, currency: 'COP' }, liftSuspension: false }).incident;

    expect(moneyOnly.penalties[0]!.reversal).toBeNull();
    expect(moneyOnly.forgivenAt).toEqual(now);
    expect(original.reverse(decision, { refund: null, liftSuspension: false }).changed).toBe(false);
  });

  it('rejects a negative notice', () => {
    expect(() => incident({ noticeMinutes: -1 })).toThrow(/noticeMinutes/);
  });
});
