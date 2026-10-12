import { describe, expect, it } from 'vitest';
import { bookingSettingsIssues, surchargeTierIssues } from '../../../../src/domain/pricing/bookingSettingsRules.js';

const at = (issues: { path: string; code: string }[]) => issues.map(({ path, code }) => ({ path, code }));

describe('surchargeTierIssues', () => {
  it('accepts sorted tiers with a gap and an unbounded last tier', () => {
    expect(
      surchargeTierIssues([
        { fromMinutes: 0, toMinutes: 120, amount: 10000 },
        { fromMinutes: 180, toMinutes: null, amount: 0 },
      ]),
    ).toEqual([]);
  });

  it('refuses an empty list, on the list', () => {
    expect(at(surchargeTierIssues([]))).toEqual([{ path: 'leadTimeSurcharge.tiers', code: 'tiers_required' }]);
  });

  it('refuses a negative start, on that tier', () => {
    expect(at(surchargeTierIssues([{ fromMinutes: -1, toMinutes: null, amount: 0 }]))).toEqual([
      { path: 'leadTimeSurcharge.tiers.0.fromMinutes', code: 'tier_from_invalid' },
    ]);
  });

  it('refuses an end not after its start', () => {
    expect(at(surchargeTierIssues([{ fromMinutes: 60, toMinutes: 60, amount: 0 }]))).toEqual([
      { path: 'leadTimeSurcharge.tiers.0.toMinutes', code: 'tier_to_not_after_from' },
    ]);
  });

  it('refuses an unbounded tier that is not the last', () => {
    expect(
      at(
        surchargeTierIssues([
          { fromMinutes: 0, toMinutes: null, amount: 0 },
          { fromMinutes: 120, toMinutes: null, amount: 0 },
        ]),
      ),
    ).toEqual([{ path: 'leadTimeSurcharge.tiers.0.toMinutes', code: 'tier_unbounded_not_last' }]);
  });

  it('refuses a tier that starts before the previous one ends, on its start', () => {
    expect(
      at(
        surchargeTierIssues([
          { fromMinutes: 0, toMinutes: 180, amount: 0 },
          { fromMinutes: 150, toMinutes: null, amount: 0 },
        ]),
      ),
    ).toEqual([{ path: 'leadTimeSurcharge.tiers.1.fromMinutes', code: 'tier_overlap' }]);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
  ])('refuses a %s amount', (_label, amount) => {
    expect(at(surchargeTierIssues([{ fromMinutes: 0, toMinutes: null, amount }]))).toEqual([
      { path: 'leadTimeSurcharge.tiers.0.amount', code: 'tier_amount_invalid' },
    ]);
  });

  it('reports every issue, not only the first', () => {
    const issues = surchargeTierIssues([
      { fromMinutes: 0, toMinutes: 0, amount: -1 },
      { fromMinutes: -5, toMinutes: null, amount: 0 },
    ]);
    expect(at(issues)).toEqual(
      expect.arrayContaining([
        { path: 'leadTimeSurcharge.tiers.0.toMinutes', code: 'tier_to_not_after_from' },
        { path: 'leadTimeSurcharge.tiers.0.amount', code: 'tier_amount_invalid' },
        { path: 'leadTimeSurcharge.tiers.1.fromMinutes', code: 'tier_from_invalid' },
      ]),
    );
  });
});

describe('bookingSettingsIssues', () => {
  it('accepts no values at all', () => {
    expect(bookingSettingsIssues({})).toEqual([]);
  });

  it('accepts the Colombia example', () => {
    expect(
      bookingSettingsIssues({
        bookingWindowDays: 7,
        minNoticeMinutes: 60,
        freeCancellationMinutes: 60,
        travelBufferMinutes: 30,
        leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 0 }] },
        goalkeeperPenalties: { lateNoticeMinutes: 120, lateSuspensionDays: 3, weeklyLimit: 3, windowDays: 7, limitSuspensionDays: 7 },
        checkInWindow: { opensMinutesBefore: 30, closesMinutesAfter: 15 },
        noShowGraceMinutes: 60,
      }),
    ).toEqual([]);
  });

  it.each([
    ['bookingWindowDays', { bookingWindowDays: 0 }],
    ['minNoticeMinutes', { minNoticeMinutes: -1 }],
    ['freeCancellationMinutes', { freeCancellationMinutes: 1.5 }],
    ['travelBufferMinutes', { travelBufferMinutes: -1 }],
    ['noShowGraceMinutes', { noShowGraceMinutes: 14 }],
    ['noShowGraceMinutes', { noShowGraceMinutes: 241 }],
    ['checkInWindow.opensMinutesBefore', { checkInWindow: { opensMinutesBefore: 0 } }],
    ['checkInWindow.opensMinutesBefore', { checkInWindow: { opensMinutesBefore: 121 } }],
    ['checkInWindow.closesMinutesAfter', { checkInWindow: { closesMinutesAfter: 61 } }],
    ['goalkeeperPenalties.weeklyLimit', { goalkeeperPenalties: { weeklyLimit: 0 } }],
    ['goalkeeperPenalties.lateNoticeMinutes', { goalkeeperPenalties: { lateNoticeMinutes: 2.5 } }],
  ])('refuses an invalid %s, on that field', (path, fields) => {
    expect(at(bookingSettingsIssues(fields))).toEqual([{ path, code: 'out_of_range' }]);
  });

  it('includes the surcharge tiers', () => {
    expect(at(bookingSettingsIssues({ leadTimeSurcharge: { tiers: [] } }))).toEqual([
      { path: 'leadTimeSurcharge.tiers', code: 'tiers_required' },
    ]);
  });

  it('reports every field that fails', () => {
    expect(at(bookingSettingsIssues({ bookingWindowDays: 0, minNoticeMinutes: -1 }))).toEqual([
      { path: 'bookingWindowDays', code: 'out_of_range' },
      { path: 'minNoticeMinutes', code: 'out_of_range' },
    ]);
  });

  it('skips null values inside the country-only groups', () => {
    expect(bookingSettingsIssues({ checkInWindow: { opensMinutesBefore: null, closesMinutesAfter: 15 } })).toEqual([]);
  });
});
