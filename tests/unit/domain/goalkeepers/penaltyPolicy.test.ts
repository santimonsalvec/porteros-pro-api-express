import { describe, expect, it } from 'vitest';
import { DEFAULT_GOALKEEPER_PENALTIES, isLate, penaltiesFor, windowStart } from '../../../../src/domain/goalkeepers/penaltyPolicy.js';

const config = DEFAULT_GOALKEEPER_PENALTIES;
const occurredAt = new Date('2026-09-21T18:30:00.000Z');
let counter = 0;
const newId = () => `p-${++counter}`;
const days = (n: number) => new Date(occurredAt.getTime() + n * 86_400_000);

describe('penalty policy (feature 018)', () => {
  it('is late only with strictly less notice than the threshold', () => {
    expect(isLate(120, config)).toBe(false);
    expect(isLate(119, config)).toBe(true);
    expect(isLate(0, config)).toBe(true);
  });

  it('suspends a late withdrawal for the late duration', () => {
    expect(penaltiesFor({ occurredAt, late: true, recentCount: 0, config, newId })).toEqual([
      { id: expect.any(String), kind: 'late', days: 3, startsAt: occurredAt, endsAt: days(3) },
    ]);
  });

  it('does not suspend an in-time withdrawal below the weekly limit', () => {
    expect(penaltiesFor({ occurredAt, late: false, recentCount: 0, config, newId })).toEqual([]);
    expect(penaltiesFor({ occurredAt, late: false, recentCount: 1, config, newId })).toEqual([]);
  });

  it('suspends the one reaching the weekly limit (counting itself), and every later one in the window', () => {
    expect(penaltiesFor({ occurredAt, late: false, recentCount: 2, config, newId })).toEqual([
      { id: expect.any(String), kind: 'weekly_limit', days: 7, startsAt: occurredAt, endsAt: days(7) },
    ]);
    expect(penaltiesFor({ occurredAt, late: false, recentCount: 3, config, newId }).map((p) => p.kind)).toEqual(['weekly_limit']);
  });

  it('applies both rules to a late withdrawal at the limit', () => {
    expect(penaltiesFor({ occurredAt, late: true, recentCount: 2, config, newId }).map((p) => [p.kind, p.days])).toEqual([
      ['late', 3],
      ['weekly_limit', 7],
    ]);
  });

  it("honours a country's own values", () => {
    const custom = { ...config, weeklyLimit: 2, limitSuspensionDays: 10 };
    expect(penaltiesFor({ occurredAt, late: false, recentCount: 1, config: custom, newId })).toEqual([
      { id: expect.any(String), kind: 'weekly_limit', days: 10, startsAt: occurredAt, endsAt: days(10) },
    ]);
  });

  it('counts the window over the last windowDays × 24 h', () => {
    expect(windowStart(occurredAt, config)).toEqual(days(-7));
  });
});
