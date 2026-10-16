import { resolveLayered, type SettingLevel } from '../settings/layered.js';

/**
 * Rules that span the country and its markets (admin spec 004, FR-010, FR-011; spec 031): each
 * market inherits, field by field, what it does not set, so a change in the country can break a market.
 */

export type RuleOrigin = Extract<SettingLevel, 'market' | 'country' | 'platform'>;

/** The three values these checks read, as one level stores them (`null` = not set there). */
export interface NoticeRules {
  minNoticeMinutes: number | null;
  travelBufferMinutes: number | null;
  freeCancellationMinutes: number | null;
}

export interface RuleLevel {
  id: string;
  name: string;
  rules: NoticeRules;
}

/** What applies when no level sets a value (the quote's own defaults). */
export interface RuleDefaults {
  travelBufferMinutes: number;
  freeCancellationMinutes: number;
}

/** A level left with a minimum notice not above its travel buffer: its search would end before it starts. */
export interface NoticeViolation {
  marketId: string | null;
  marketName: string;
  minNoticeMinutes: number;
  travelBufferMinutes: number;
  origins: { minNoticeMinutes: RuleOrigin; travelBufferMinutes: RuleOrigin };
}

type Field = keyof NoticeRules;

function effective(field: Field, country: NoticeRules, market: NoticeRules | null, defaults: RuleDefaults): { value: number | null; origin: RuleOrigin | null } {
  const fallback = field === 'minNoticeMinutes' ? null : defaults[field];
  const resolved = resolveLayered({ market: market?.[field], country: country[field] }, fallback);
  return { value: resolved.value, origin: resolved.origin as RuleOrigin | null };
}

/** The country and each market as the quote would read them. */
function levels(country: { name: string; rules: NoticeRules }, markets: readonly RuleLevel[]) {
  return [{ marketId: null, name: country.name, rules: null }, ...markets.map((market) => ({ marketId: market.id, name: market.name, rules: market.rules }))];
}

export function noticeViolations(country: { name: string; rules: NoticeRules }, markets: readonly RuleLevel[], defaults: RuleDefaults): NoticeViolation[] {
  return levels(country, markets).flatMap(({ marketId, name, rules }) => {
    const notice = effective('minNoticeMinutes', country.rules, rules, defaults);
    const buffer = effective('travelBufferMinutes', country.rules, rules, defaults);
    if (notice.value === null || buffer.value === null || notice.value > buffer.value) return [];
    return [
      {
        marketId,
        marketName: name,
        minNoticeMinutes: notice.value,
        travelBufferMinutes: buffer.value,
        origins: { minNoticeMinutes: notice.origin!, travelBufferMinutes: buffer.origin! },
      },
    ];
  });
}

/** The levels whose travel buffer exceeds their free cancellation (allowed, but warned). */
export function buffersAboveFreeCancellation(country: { name: string; rules: NoticeRules }, markets: readonly RuleLevel[], defaults: RuleDefaults): string[] {
  return levels(country, markets)
    .filter(({ rules }) => {
      const buffer = effective('travelBufferMinutes', country.rules, rules, defaults).value ?? 0;
      const cancellation = effective('freeCancellationMinutes', country.rules, rules, defaults).value ?? 0;
      return buffer > cancellation;
    })
    .map(({ name }) => name);
}

const REQUIRED = ['bookingWindowDays', 'minNoticeMinutes', 'leadTimeSurcharge'] as const;
export type RequiredSetting = (typeof REQUIRED)[number];

/** The values without which an area cannot quote that the country had and is now removing. */
export function removedRequiredSettings(
  before: Record<RequiredSetting, unknown> | null,
  after: Record<RequiredSetting, unknown>,
): RequiredSetting[] {
  if (before === null) return [];
  return REQUIRED.filter((field) => before[field] !== null && after[field] === null);
}
