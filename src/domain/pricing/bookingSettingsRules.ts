import type { CheckInWindowConfig } from '../bookings/checkInWindow.js';
import { PENALTY_CONFIG_FIELDS, type GoalkeeperPenaltyConfig } from '../goalkeepers/penaltyPolicy.js';
import type { SurchargeTier } from './bookingSettings.js';
import { issue, type ConfigIssue } from './configIssue.js';

/** The values one booking-settings level may hold; `null`/absent = not set at that level. */
export interface BookingSettingsFields {
  bookingWindowDays?: number | null;
  minNoticeMinutes?: number | null;
  leadTimeSurcharge?: { tiers: SurchargeTier[] } | null;
  freeCancellationMinutes?: number | null;
  travelBufferMinutes?: number | null;
  goalkeeperPenalties?: Partial<Record<keyof GoalkeeperPenaltyConfig, number | null>> | null;
  checkInWindow?: Partial<Record<keyof CheckInWindowConfig, number | null>> | null;
  noShowGraceMinutes?: number | null;
  /** How often an open offer is pushed again, and how many times (spec 031, FR-017). */
  offerReminderIntervalMinutes?: number | null;
  offerMaxReminders?: number | null;
}

/** The values only a country may set: company policy, the same across its markets (FR-014). */
export const COUNTRY_ONLY_FIELDS = ['goalkeeperPenalties'] as const;

const TIERS = 'leadTimeSurcharge.tiers';

/**
 * Every rule the surcharge tiers break (business-settings §5.3): at least one tier, `fromMinutes`
 * ≥ 0 inclusive, `toMinutes` exclusive and after it, only the last unbounded, sorted without
 * overlaps (gaps allowed), whole amounts ≥ 0.
 */
export function surchargeTierIssues(tiers: readonly SurchargeTier[]): ConfigIssue[] {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return [issue(TIERS, 'tiers_required', 'leadTimeSurcharge.tiers must be a non-empty array')];
  }
  const issues: ConfigIssue[] = [];
  tiers.forEach((tier, index) => {
    const at = `${TIERS}.${index}`;
    const fromValid = Number.isFinite(tier.fromMinutes) && tier.fromMinutes >= 0;
    if (!fromValid) issues.push(issue(`${at}.fromMinutes`, 'tier_from_invalid', `tier ${index} fromMinutes must be at least 0`));
    if (tier.toMinutes !== null && (!Number.isFinite(tier.toMinutes) || tier.toMinutes <= tier.fromMinutes)) {
      issues.push(issue(`${at}.toMinutes`, 'tier_to_not_after_from', `tier ${index} toMinutes must be greater than fromMinutes`));
    }
    if (tier.toMinutes === null && index < tiers.length - 1) {
      issues.push(issue(`${at}.toMinutes`, 'tier_unbounded_not_last', 'only the last tier may be unbounded'));
    }
    if (!Number.isInteger(tier.amount) || tier.amount < 0) {
      issues.push(issue(`${at}.amount`, 'tier_amount_invalid', `tier ${index} amount must be an integer of at least 0`));
    }
    const previousEnd = index > 0 ? tiers[index - 1].toMinutes : 0;
    if (fromValid && index > 0 && previousEnd !== null && tier.fromMinutes < previousEnd) {
      issues.push(issue(`${at}.fromMinutes`, 'tier_overlap', 'tiers must be sorted and must not overlap'));
    }
  });
  return issues;
}

type Range = { min: number; max?: number };

const FIELD_RANGES: readonly [keyof BookingSettingsFields, Range][] = [
  ['bookingWindowDays', { min: 1 }],
  ['minNoticeMinutes', { min: 0 }],
  ['freeCancellationMinutes', { min: 0 }],
  ['travelBufferMinutes', { min: 0 }],
];

const CHECK_IN_RANGES: Record<keyof CheckInWindowConfig, Range> = {
  opensMinutesBefore: { min: 1, max: 120 },
  closesMinutesAfter: { min: 1, max: 60 },
};

function rangeIssue(path: string, value: number | null | undefined, range: Range): ConfigIssue | null {
  if (value === null || value === undefined) return null;
  if (Number.isInteger(value) && value >= range.min && (range.max === undefined || value <= range.max)) return null;
  const message =
    range.max === undefined
      ? `${path} must be an integer of at least ${range.min}`
      : `${path} must be an integer between ${range.min} and ${range.max}`;
  return issue(path, 'out_of_range', message);
}

/**
 * Every rule one level's values break (business-settings §5–§8), each on its own path. A market
 * may not hold a country-only value (spec 031, FR-014).
 */
export function bookingSettingsIssues(fields: BookingSettingsFields, scope: 'country' | 'market' = 'country'): ConfigIssue[] {
  const issues: (ConfigIssue | null)[] = [];
  if (scope === 'market') {
    for (const field of COUNTRY_ONLY_FIELDS) {
      if (fields[field] !== null && fields[field] !== undefined) {
        issues.push(issue(field, 'field_not_allowed_at_level', `${field} is set only by a country`));
      }
    }
  }
  for (const [field, range] of FIELD_RANGES) {
    issues.push(rangeIssue(field, fields[field] as number | null | undefined, range));
  }
  if (fields.leadTimeSurcharge) issues.push(...surchargeTierIssues(fields.leadTimeSurcharge.tiers));
  for (const field of PENALTY_CONFIG_FIELDS) {
    issues.push(rangeIssue(`goalkeeperPenalties.${field}`, fields.goalkeeperPenalties?.[field], { min: 1 }));
  }
  for (const [field, range] of Object.entries(CHECK_IN_RANGES) as [keyof CheckInWindowConfig, Range][]) {
    issues.push(rangeIssue(`checkInWindow.${field}`, fields.checkInWindow?.[field], range));
  }
  issues.push(rangeIssue('noShowGraceMinutes', fields.noShowGraceMinutes, { min: 15, max: 240 }));
  issues.push(rangeIssue('offerReminderIntervalMinutes', fields.offerReminderIntervalMinutes, { min: 1, max: 1440 }));
  issues.push(rangeIssue('offerMaxReminders', fields.offerMaxReminders, { min: 0, max: 10 }));
  return issues.filter((item): item is ConfigIssue => item !== null);
}
