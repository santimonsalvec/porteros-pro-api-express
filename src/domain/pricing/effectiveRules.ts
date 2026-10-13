/**
 * Rules that span the country and its anchor cities (admin spec 004, FR-010, FR-011): each city
 * inherits, field by field, what it does not set, so a change in the country can break a city.
 */

export type RuleOrigin = 'city' | 'country' | 'default';

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
  cityId: string | null;
  cityName: string;
  minNoticeMinutes: number;
  travelBufferMinutes: number;
  origins: { minNoticeMinutes: RuleOrigin; travelBufferMinutes: RuleOrigin };
}

type Field = keyof NoticeRules;

function effective(field: Field, country: NoticeRules, city: NoticeRules | null, defaults: RuleDefaults): { value: number | null; origin: RuleOrigin | null } {
  const own = city?.[field] ?? null;
  if (own !== null) return { value: own, origin: 'city' };
  if (country[field] !== null) return { value: country[field], origin: 'country' };
  const fallback = field === 'minNoticeMinutes' ? null : defaults[field];
  return fallback === null ? { value: null, origin: null } : { value: fallback, origin: 'default' };
}

/** The country and each city as the quote would read them. */
function levels(country: { name: string; rules: NoticeRules }, cities: readonly RuleLevel[]) {
  return [{ cityId: null, name: country.name, rules: null }, ...cities.map((city) => ({ cityId: city.id, name: city.name, rules: city.rules }))];
}

export function noticeViolations(country: { name: string; rules: NoticeRules }, cities: readonly RuleLevel[], defaults: RuleDefaults): NoticeViolation[] {
  return levels(country, cities).flatMap(({ cityId, name, rules }) => {
    const notice = effective('minNoticeMinutes', country.rules, rules, defaults);
    const buffer = effective('travelBufferMinutes', country.rules, rules, defaults);
    if (notice.value === null || buffer.value === null || notice.value > buffer.value) return [];
    return [
      {
        cityId,
        cityName: name,
        minNoticeMinutes: notice.value,
        travelBufferMinutes: buffer.value,
        origins: { minNoticeMinutes: notice.origin!, travelBufferMinutes: buffer.origin! },
      },
    ];
  });
}

/** The levels whose travel buffer exceeds their free cancellation (allowed, but warned). */
export function buffersAboveFreeCancellation(country: { name: string; rules: NoticeRules }, cities: readonly RuleLevel[], defaults: RuleDefaults): string[] {
  return levels(country, cities)
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
