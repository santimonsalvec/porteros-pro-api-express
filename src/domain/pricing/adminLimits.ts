import type { BookingSettingsFields } from './bookingSettingsRules.js';
import { issue, type ConfigIssue } from './configIssue.js';

/**
 * Upper bounds the admin web enforces on what it writes (admin spec 004, research §3). The
 * constructors never apply them, so values seeded before keep being read.
 */
export const ADMIN_LIMITS = Object.freeze({
  amount: 100_000_000,
  bookingWindowDays: 90,
  ruleMinutes: 10_080,
  tierMinutes: 129_600,
  tiers: 20,
  penaltyCount: 365,
  /** Admin spec 030: the platform's ceiling for the unverified discount (30 %). */
  unverifiedDiscountBps: 3000,
  /** Admin spec 030: the verified-only window, at most a day. */
  verifiedPriorityMinutes: 1440,
});

const aboveLimit = (path: string, limit: number) => issue(path, 'above_limit', `${path} must be at most ${limit}`);

function limitIssue(path: string, value: number | null | undefined, limit: number): ConfigIssue[] {
  return typeof value === 'number' && value > limit ? [aboveLimit(path, limit)] : [];
}

/** A rate, commission or surcharge amount above the admin's ceiling. */
export function amountLimitIssues(path: string, amount: number | null | undefined): ConfigIssue[] {
  return limitIssue(path, amount, ADMIN_LIMITS.amount);
}

function tierLimitIssues(tiers: BookingSettingsFields['leadTimeSurcharge']): ConfigIssue[] {
  if (!tiers) return [];
  if (tiers.tiers.length > ADMIN_LIMITS.tiers) {
    return [issue('leadTimeSurcharge.tiers', 'too_many_tiers', `leadTimeSurcharge.tiers must have at most ${ADMIN_LIMITS.tiers} tiers`)];
  }
  return tiers.tiers.flatMap((tier, index) => {
    const at = `leadTimeSurcharge.tiers.${index}`;
    const bound = (field: 'fromMinutes' | 'toMinutes', value: number | null): ConfigIssue[] => {
      if (value === null) return [];
      if (!Number.isInteger(value)) return [issue(`${at}.${field}`, 'not_whole_minutes', `${at}.${field} must be whole minutes`)];
      return limitIssue(`${at}.${field}`, value, ADMIN_LIMITS.tierMinutes);
    };
    return [...bound('fromMinutes', tier.fromMinutes), ...bound('toMinutes', tier.toMinutes), ...amountLimitIssues(`${at}.amount`, tier.amount)];
  });
}

/** Every value of one booking-settings level above the admin's ceilings. */
export function bookingSettingsLimitIssues(fields: BookingSettingsFields): ConfigIssue[] {
  const penalties = fields.goalkeeperPenalties ?? {};
  return [
    ...limitIssue('bookingWindowDays', fields.bookingWindowDays, ADMIN_LIMITS.bookingWindowDays),
    ...limitIssue('minNoticeMinutes', fields.minNoticeMinutes, ADMIN_LIMITS.ruleMinutes),
    ...limitIssue('freeCancellationMinutes', fields.freeCancellationMinutes, ADMIN_LIMITS.ruleMinutes),
    ...limitIssue('travelBufferMinutes', fields.travelBufferMinutes, ADMIN_LIMITS.ruleMinutes),
    ...tierLimitIssues(fields.leadTimeSurcharge),
    ...limitIssue('goalkeeperPenalties.lateNoticeMinutes', penalties.lateNoticeMinutes, ADMIN_LIMITS.ruleMinutes),
    ...(['lateSuspensionDays', 'weeklyLimit', 'windowDays', 'limitSuspensionDays'] as const).flatMap((field) =>
      limitIssue(`goalkeeperPenalties.${field}`, penalties[field], ADMIN_LIMITS.penaltyCount),
    ),
  ];
}
