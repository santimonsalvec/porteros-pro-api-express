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
import { NO_SHOW_GRACE_DEFAULT_MINUTES } from '../../bookingLifecycle/common/checkInWindowResolver.js';
import { warning, type Warning } from '../../geography/common/warnings.js';
import { FREE_CANCELLATION_MINUTES_DEFAULT, TRAVEL_BUFFER_MINUTES_DEFAULT } from '../../goalkeeperRequests/common/bookingLimits.js';
import { resolveBookingSettingsWithOrigin } from '../../goalkeeperRequests/common/resolveBookingSettings.js';
import { fieldErrorsOf } from './fieldErrors.js';
import type { PricingGeography } from './pricingGeography.js';
import type { BookingSettingsRecord, IBookingSettingsAdmin, StoredBookingSettings } from './ports.js';

/** The five rules an anchor city may override; the other three live only in the country (FR-008). */
export const CITY_RULE_FIELDS = ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge', 'freeCancellationMinutes', 'travelBufferMinutes'] as const;
export type CityRuleFields = Pick<StoredBookingSettings, (typeof CITY_RULE_FIELDS)[number]>;

export const EMPTY_SETTINGS: StoredBookingSettings = {
  bookingWindowDays: null,
  minNoticeMinutes: null,
  leadTimeSurcharge: null,
  freeCancellationMinutes: null,
  travelBufferMinutes: null,
  goalkeeperPenalties: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
};

const RULE_DEFAULTS = { travelBufferMinutes: TRAVEL_BUFFER_MINUTES_DEFAULT, freeCancellationMinutes: FREE_CANCELLATION_MINUTES_DEFAULT };

/** What applies where no level sets an optional rule: the values the quote and the jobs already use. */
export const SETTING_DEFAULTS = {
  ...RULE_DEFAULTS,
  noShowGraceMinutes: NO_SHOW_GRACE_DEFAULT_MINUTES,
  goalkeeperPenalties: { ...DEFAULT_GOALKEEPER_PENALTIES },
  checkInWindow: { ...CHECK_IN_DEFAULTS },
};

export const cityPart = (fields: StoredBookingSettings): CityRuleFields =>
  Object.fromEntries(CITY_RULE_FIELDS.map((field) => [field, fields[field] ?? null])) as CityRuleFields;

/** The record as the quote's entity, or `null` when there is none or the domain refuses it. */
export function asSettings(record: BookingSettingsRecord | null): BookingSettings | null {
  if (!record || record.invalid) return null;
  return new BookingSettings({ id: `${record.scope}:${record.refId}`, scope: record.scope, refId: record.refId, ...(record.fields as object) });
}

export function effectiveRules(city: BookingSettingsRecord | null, country: BookingSettingsRecord | null) {
  return resolveBookingSettingsWithOrigin({ city: asSettings(city), country: asSettings(country) });
}

/** Every rule a level's values break, as `validation_failed` field errors (`null` when none). */
export function settingsFieldErrors(fields: StoredBookingSettings): Record<string, string> | null {
  const issues = [...bookingSettingsIssues(fields), ...bookingSettingsLimitIssues(fields)];
  return issues.length > 0 ? fieldErrorsOf(issues) : null;
}

const noticeRules = (fields: StoredBookingSettings): NoticeRules => ({
  minNoticeMinutes: fields.minNoticeMinutes,
  travelBufferMinutes: fields.travelBufferMinutes,
  freeCancellationMinutes: fields.freeCancellationMinutes,
});

/** The anchor cities of the country that override some rule, with the values they store. */
export async function cityLevelsOf(settings: IBookingSettingsAdmin, geography: PricingGeography, countryId: string): Promise<(RuleLevel & { fields: StoredBookingSettings })[]> {
  const records = await settings.listCityScoped();
  return records.flatMap((record) => {
    const city = geography.city(record.refId);
    if (!city || city.zoneCityId !== null || geography.countryOf(city.id)?.id !== countryId) return [];
    return [{ id: city.id, name: city.name, rules: noticeRules(record.fields), fields: record.fields }];
  });
}

/**
 * The cross-level checks of one save (FR-010): a notice not above the buffer anywhere is refused;
 * a buffer above the free cancellation is warned. `onlyCityId` limits both to one city's save.
 */
export function checkLevels(
  country: { name: string; fields: StoredBookingSettings },
  cities: readonly (RuleLevel & { fields?: StoredBookingSettings })[],
  onlyCityId: string | null,
): { violations: NoticeViolation[]; bufferLevels: string[] } {
  const countryLevel = { name: country.name, rules: noticeRules(country.fields) };
  const levels = onlyCityId === null ? cities : cities.filter((city) => city.id === onlyCityId);
  const violations = noticeViolations(countryLevel, levels, RULE_DEFAULTS).filter((violation) => onlyCityId === null || violation.cityId === onlyCityId);
  const bufferLevels = buffersAboveFreeCancellation(countryLevel, levels, RULE_DEFAULTS).filter((name) => onlyCityId === null || name !== country.name);
  return { violations, bufferLevels };
}

export function bufferWarning(levels: string[]): Warning[] {
  return levels.length > 0 ? [warning('travel_buffer_exceeds_free_cancellation', { levels })] : [];
}

/** A city level as stored: its five rules, never the country-only ones. */
export const withCityRules = (fields: CityRuleFields): StoredBookingSettings => ({ ...EMPTY_SETTINGS, ...cityPart(fields as StoredBookingSettings) });
export const asNoticeRules = noticeRules;
