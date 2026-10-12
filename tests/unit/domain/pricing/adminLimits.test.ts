import { describe, expect, it } from 'vitest';
import { ADMIN_LIMITS, amountLimitIssues, bookingSettingsLimitIssues } from '../../../../src/domain/pricing/adminLimits.js';

const at = (issues: { path: string; code: string }[]) => issues.map(({ path, code }) => ({ path, code }));
const tier = (fromMinutes: number, toMinutes: number | null, amount = 0) => ({ fromMinutes, toMinutes, amount });

describe('amountLimitIssues', () => {
  it('accepts an amount up to the limit', () => {
    expect(amountLimitIssues('amount', ADMIN_LIMITS.amount)).toEqual([]);
  });

  it('refuses an amount above the limit', () => {
    expect(at(amountLimitIssues('amount', ADMIN_LIMITS.amount + 1))).toEqual([{ path: 'amount', code: 'above_limit' }]);
  });
});

describe('bookingSettingsLimitIssues', () => {
  it('accepts every value exactly at its limit', () => {
    expect(
      bookingSettingsLimitIssues({
        bookingWindowDays: 90,
        minNoticeMinutes: 10080,
        freeCancellationMinutes: 10080,
        travelBufferMinutes: 10080,
        leadTimeSurcharge: { tiers: [tier(0, 129600, 100_000_000), tier(129600, null)] },
        goalkeeperPenalties: { lateNoticeMinutes: 10080, lateSuspensionDays: 365, weeklyLimit: 365, windowDays: 365, limitSuspensionDays: 365 },
      }),
    ).toEqual([]);
  });

  it.each([
    ['bookingWindowDays', { bookingWindowDays: 91 }],
    ['minNoticeMinutes', { minNoticeMinutes: 10081 }],
    ['freeCancellationMinutes', { freeCancellationMinutes: 10081 }],
    ['travelBufferMinutes', { travelBufferMinutes: 10081 }],
    ['goalkeeperPenalties.lateNoticeMinutes', { goalkeeperPenalties: { lateNoticeMinutes: 10081 } }],
    ['goalkeeperPenalties.weeklyLimit', { goalkeeperPenalties: { weeklyLimit: 366 } }],
    ['goalkeeperPenalties.windowDays', { goalkeeperPenalties: { windowDays: 366 } }],
    ['leadTimeSurcharge.tiers.0.toMinutes', { leadTimeSurcharge: { tiers: [tier(0, 129601)] } }],
    ['leadTimeSurcharge.tiers.0.fromMinutes', { leadTimeSurcharge: { tiers: [tier(129601, null)] } }],
    ['leadTimeSurcharge.tiers.0.amount', { leadTimeSurcharge: { tiers: [tier(0, null, 100_000_001)] } }],
  ])('refuses %s above its limit', (path, fields) => {
    expect(at(bookingSettingsLimitIssues(fields))).toEqual([{ path, code: 'above_limit' }]);
  });

  it('refuses more than 20 tiers, on the list', () => {
    const tiers = Array.from({ length: 21 }, (_, index) => tier(index * 10, index === 20 ? null : index * 10 + 10));
    expect(at(bookingSettingsLimitIssues({ leadTimeSurcharge: { tiers } }))).toEqual([{ path: 'leadTimeSurcharge.tiers', code: 'too_many_tiers' }]);
  });

  it('refuses tier bounds that are not whole minutes', () => {
    expect(at(bookingSettingsLimitIssues({ leadTimeSurcharge: { tiers: [tier(0.5, null)] } }))).toEqual([
      { path: 'leadTimeSurcharge.tiers.0.fromMinutes', code: 'not_whole_minutes' },
    ]);
  });

  it('ignores values that are not set', () => {
    expect(bookingSettingsLimitIssues({ bookingWindowDays: null, goalkeeperPenalties: null })).toEqual([]);
  });
});
