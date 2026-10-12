import type { BookingSettings, LeadTimeSurcharge } from '../../../../domain/pricing/bookingSettings.js';
import { FREE_CANCELLATION_MINUTES_DEFAULT, TRAVEL_BUFFER_MINUTES_DEFAULT } from './bookingLimits.js';

export type MissingSetting = 'bookingWindowDays' | 'minNoticeMinutes' | 'leadTimeSurcharge' | 'currency' | 'commission';

export interface ResolvedBookingSettings {
  bookingWindowDays: number | null;
  minNoticeMinutes: number | null;
  leadTimeSurcharge: LeadTimeSurcharge | null;
  /** `null` when neither level defines it — never "missing": a default applies (FR-014). */
  freeCancellationMinutes: number | null;
  /** `null` when neither level defines it — never "missing": a default applies (FR-010 of 012). */
  travelBufferMinutes: number | null;
  /** Names of the settings defined at neither level. Empty ⇒ the area is quotable. */
  missing: MissingSetting[];
}

export type SettingOrigin = 'city' | 'country' | 'default';

/** One setting's effective value and where it comes from; `origin: null` when it is missing. */
export interface ResolvedSetting<T> {
  value: T | null;
  origin: SettingOrigin | null;
}

export interface BookingSettingsWithOrigin {
  bookingWindowDays: ResolvedSetting<number>;
  minNoticeMinutes: ResolvedSetting<number>;
  leadTimeSurcharge: ResolvedSetting<LeadTimeSurcharge>;
  freeCancellationMinutes: ResolvedSetting<number>;
  travelBufferMinutes: ResolvedSetting<number>;
}

type Docs = { city: BookingSettings | null; country: BookingSettings | null };
type InheritedField = keyof BookingSettingsWithOrigin;

function inherited<Field extends InheritedField>(docs: Docs, field: Field, fallback: number | null = null) {
  const cityValue = docs.city?.[field] ?? null;
  if (cityValue !== null) return { value: cityValue, origin: 'city' as const };
  const countryValue = docs.country?.[field] ?? null;
  if (countryValue !== null) return { value: countryValue, origin: 'country' as const };
  return fallback === null ? { value: null, origin: null } : { value: fallback, origin: 'default' as const };
}

/**
 * Each setting on its own: the city's value if it defines one, otherwise its country's. The free
 * cancellation and the travel buffer then fall back to their defaults; the other three are missing
 * (the admin's simulator and booking-rule screens show where every value comes from).
 */
export function resolveBookingSettingsWithOrigin(docs: Docs): BookingSettingsWithOrigin {
  return {
    bookingWindowDays: inherited(docs, 'bookingWindowDays'),
    minNoticeMinutes: inherited(docs, 'minNoticeMinutes'),
    leadTimeSurcharge: inherited(docs, 'leadTimeSurcharge') as ResolvedSetting<LeadTimeSurcharge>,
    freeCancellationMinutes: inherited(docs, 'freeCancellationMinutes', FREE_CANCELLATION_MINUTES_DEFAULT),
    travelBufferMinutes: inherited(docs, 'travelBufferMinutes', TRAVEL_BUFFER_MINUTES_DEFAULT),
  } as BookingSettingsWithOrigin;
}

/** A value that only a default supplies counts as "not configured" here: the caller applies it. */
const configured = <T>(setting: ResolvedSetting<T>): T | null => (setting.origin === 'default' ? null : setting.value);

/**
 * Each of the three settings resolves on its own: the city's value if it defines one,
 * otherwise its country's, otherwise it is missing. There are no built-in defaults —
 * a missing setting makes the area unquotable rather than assumed (FR-025).
 */
export function resolveBookingSettings(docs: Docs): ResolvedBookingSettings {
  const resolved = resolveBookingSettingsWithOrigin(docs);
  const bookingWindowDays = resolved.bookingWindowDays.value;
  const minNoticeMinutes = resolved.minNoticeMinutes.value;
  const leadTimeSurcharge = resolved.leadTimeSurcharge.value;
  const travelBufferMinutes = configured(resolved.travelBufferMinutes);
  const freeCancellationMinutes = configured(resolved.freeCancellationMinutes);

  const missing: MissingSetting[] = [];
  if (bookingWindowDays === null) missing.push('bookingWindowDays');
  if (minNoticeMinutes === null) missing.push('minNoticeMinutes');
  if (leadTimeSurcharge === null) missing.push('leadTimeSurcharge');

  return { bookingWindowDays, minNoticeMinutes, leadTimeSurcharge, freeCancellationMinutes, travelBufferMinutes, missing };
}
