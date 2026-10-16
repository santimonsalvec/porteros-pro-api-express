import { CHECK_IN_DEFAULTS } from '../../../../domain/bookings/checkInWindow.js';
import { DEFAULT_GOALKEEPER_PENALTIES } from '../../../../domain/goalkeepers/penaltyPolicy.js';
import { bookingSettingsLimitIssues } from '../../../../domain/pricing/adminLimits.js';
import { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import { bookingSettingsIssues } from '../../../../domain/pricing/bookingSettingsRules.js';
import {
  buffersAboveFreeCancellation,
  noticeViolations,
  type NoticeRules,
  type NoticeViolation,
  type RuleLevel,
} from '../../../../domain/pricing/effectiveRules.js';
import { resolveLayered } from '../../../../domain/settings/layered.js';
import { NO_SHOW_GRACE_DEFAULT_MINUTES } from '../../bookingLifecycle/common/checkInWindowResolver.js';
import { resolveOfferReminders, type OfferReminderValues, type ResolvedOfferReminders } from '../../notifications/common/offerReminders.js';
import { warning, type Warning } from '../../geography/common/warnings.js';
import { FREE_CANCELLATION_MINUTES_DEFAULT, TRAVEL_BUFFER_MINUTES_DEFAULT } from '../../goalkeeperRequests/common/bookingLimits.js';
import { resolveBookingSettingsWithOrigin, type BookingSettingsWithOrigin, type ResolvedSetting } from '../../goalkeeperRequests/common/resolveBookingSettings.js';
import { fieldErrorsOf } from './fieldErrors.js';
import type { PricingGeography } from './pricingGeography.js';
import type { BookingSettingsRecord, IBookingSettingsAdmin, StoredBookingSettings } from './ports.js';

/** The rules a market may override; the goalkeeper penalties live only in the country (spec 031, FR-014). */
export const MARKET_RULE_FIELDS = [
  'bookingWindowDays',
  'minNoticeMinutes',
  'leadTimeSurcharge',
  'freeCancellationMinutes',
  'travelBufferMinutes',
  'checkInWindow',
  'noShowGraceMinutes',
  'offerReminderIntervalMinutes',
  'offerMaxReminders',
] as const;
export type MarketRuleFields = Pick<StoredBookingSettings, (typeof MARKET_RULE_FIELDS)[number]>;

export const EMPTY_SETTINGS: StoredBookingSettings = {
  bookingWindowDays: null,
  minNoticeMinutes: null,
  leadTimeSurcharge: null,
  freeCancellationMinutes: null,
  travelBufferMinutes: null,
  goalkeeperPenalties: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
  offerReminderIntervalMinutes: null,
  offerMaxReminders: null,
};

const RULE_DEFAULTS = { travelBufferMinutes: TRAVEL_BUFFER_MINUTES_DEFAULT, freeCancellationMinutes: FREE_CANCELLATION_MINUTES_DEFAULT };

/** The environment's reminder values when the composition root passes none (`config.ts` defaults). */
export const OFFER_REMINDER_DEFAULTS: OfferReminderValues = { maxReminders: 3, intervalMinutes: 5 };

/** What applies where no level sets an optional rule: the values the quote and the jobs already use. */
export function settingDefaults(platform: OfferReminderValues = OFFER_REMINDER_DEFAULTS) {
  return {
    ...RULE_DEFAULTS,
    noShowGraceMinutes: NO_SHOW_GRACE_DEFAULT_MINUTES,
    goalkeeperPenalties: { ...DEFAULT_GOALKEEPER_PENALTIES },
    checkInWindow: { ...CHECK_IN_DEFAULTS },
    offerReminderIntervalMinutes: platform.intervalMinutes,
    offerMaxReminders: platform.maxReminders,
  };
}
export type SettingDefaults = ReturnType<typeof settingDefaults>;

export const marketPart = (fields: StoredBookingSettings): MarketRuleFields =>
  Object.fromEntries(MARKET_RULE_FIELDS.map((field) => [field, fields[field] ?? null])) as MarketRuleFields;

/** The record as the quote's entity, or `null` when there is none or the domain refuses it. */
export function asSettings(record: BookingSettingsRecord | null): BookingSettings | null {
  if (!record || record.invalid) return null;
  return new BookingSettings({ id: `${record.scope}:${record.refId}`, scope: record.scope, refId: record.refId, ...(record.fields as object) });
}

/** Every value a market may override, its effective value and the level it comes from (FR-014). */
export interface EffectiveMarketRules extends BookingSettingsWithOrigin {
  checkInWindow: { opensMinutesBefore: ResolvedSetting<number>; closesMinutesAfter: ResolvedSetting<number> };
  noShowGraceMinutes: ResolvedSetting<number>;
  offerReminderIntervalMinutes: ResolvedOfferReminders['intervalMinutes'];
  offerMaxReminders: ResolvedOfferReminders['maxReminders'];
}

export function effectiveRules(
  marketRecord: BookingSettingsRecord | null,
  countryRecord: BookingSettingsRecord | null,
  platform: OfferReminderValues = OFFER_REMINDER_DEFAULTS,
): EffectiveMarketRules {
  const market = asSettings(marketRecord);
  const country = asSettings(countryRecord);
  const window = (field: keyof typeof CHECK_IN_DEFAULTS) =>
    resolveLayered({ market: market?.checkInWindow?.[field], country: country?.checkInWindow?.[field] }, CHECK_IN_DEFAULTS[field]) as ResolvedSetting<number>;
  const reminders = resolveOfferReminders({ market, country }, platform);
  return {
    ...resolveBookingSettingsWithOrigin({ market, country }),
    checkInWindow: { opensMinutesBefore: window('opensMinutesBefore'), closesMinutesAfter: window('closesMinutesAfter') },
    noShowGraceMinutes: resolveLayered(
      { market: market?.noShowGraceMinutes, country: country?.noShowGraceMinutes },
      NO_SHOW_GRACE_DEFAULT_MINUTES,
    ) as ResolvedSetting<number>,
    offerReminderIntervalMinutes: reminders.intervalMinutes,
    offerMaxReminders: reminders.maxReminders,
  };
}

/** Every rule a level's values break, as `validation_failed` field errors (`null` when none). */
export function settingsFieldErrors(fields: StoredBookingSettings, scope: 'country' | 'market' = 'country'): Record<string, string> | null {
  const issues = [...bookingSettingsIssues(fields, scope), ...bookingSettingsLimitIssues(fields)];
  return issues.length > 0 ? fieldErrorsOf(issues) : null;
}

const noticeRules = (fields: StoredBookingSettings): NoticeRules => ({
  minNoticeMinutes: fields.minNoticeMinutes,
  travelBufferMinutes: fields.travelBufferMinutes,
  freeCancellationMinutes: fields.freeCancellationMinutes,
});

/** The markets of the country that override some rule, with the values they store. */
export async function marketLevelsOf(settings: IBookingSettingsAdmin, geography: PricingGeography, countryId: string): Promise<(RuleLevel & { fields: StoredBookingSettings })[]> {
  const records = await settings.listMarketScoped();
  return records.flatMap((record) => {
    const market = geography.market(record.refId);
    if (!market || geography.countryOf(market.id)?.id !== countryId) return [];
    return [{ id: market.id, name: market.name, rules: noticeRules(record.fields), fields: record.fields }];
  });
}

/**
 * The cross-level checks of one save (FR-010): a notice not above the buffer anywhere is refused;
 * a buffer above the free cancellation is warned. `onlyCityId` limits both to one market's save.
 */
export function checkLevels(
  country: { name: string; fields: StoredBookingSettings },
  markets: readonly (RuleLevel & { fields?: StoredBookingSettings })[],
  onlyCityId: string | null,
): { violations: NoticeViolation[]; bufferLevels: string[] } {
  const countryLevel = { name: country.name, rules: noticeRules(country.fields) };
  const levels = onlyCityId === null ? markets : markets.filter((market) => market.id === onlyCityId);
  const violations = noticeViolations(countryLevel, levels, RULE_DEFAULTS).filter((violation) => onlyCityId === null || violation.marketId === onlyCityId);
  const bufferLevels = buffersAboveFreeCancellation(countryLevel, levels, RULE_DEFAULTS).filter((name) => onlyCityId === null || name !== country.name);
  return { violations, bufferLevels };
}

export function bufferWarning(levels: string[]): Warning[] {
  return levels.length > 0 ? [warning('travel_buffer_exceeds_free_cancellation', { levels })] : [];
}

/** A market level as stored: its own rules, never the country-only ones. */
export const withMarketRules = (fields: MarketRuleFields): StoredBookingSettings => ({ ...EMPTY_SETTINGS, ...marketPart(fields as StoredBookingSettings) });
export const asNoticeRules = noticeRules;
