import type { BookingSettings, LeadTimeSurcharge } from '../../../../domain/pricing/bookingSettings.js';

export type MissingSetting = 'bookingWindowDays' | 'minNoticeMinutes' | 'leadTimeSurcharge' | 'currency';

export interface ResolvedBookingSettings {
  bookingWindowDays: number | null;
  minNoticeMinutes: number | null;
  leadTimeSurcharge: LeadTimeSurcharge | null;
  /** Names of the settings defined at neither level. Empty ⇒ the area is quotable. */
  missing: MissingSetting[];
}

/**
 * Each of the three settings resolves on its own: the city's value if it defines one,
 * otherwise its country's, otherwise it is missing. There are no built-in defaults —
 * a missing setting makes the area unquotable rather than assumed (FR-025).
 */
export function resolveBookingSettings(docs: {
  city: BookingSettings | null;
  country: BookingSettings | null;
}): ResolvedBookingSettings {
  const bookingWindowDays = docs.city?.bookingWindowDays ?? docs.country?.bookingWindowDays ?? null;
  const minNoticeMinutes = docs.city?.minNoticeMinutes ?? docs.country?.minNoticeMinutes ?? null;
  const leadTimeSurcharge = docs.city?.leadTimeSurcharge ?? docs.country?.leadTimeSurcharge ?? null;

  const missing: MissingSetting[] = [];
  if (bookingWindowDays === null) missing.push('bookingWindowDays');
  if (minNoticeMinutes === null) missing.push('minNoticeMinutes');
  if (leadTimeSurcharge === null) missing.push('leadTimeSurcharge');

  return { bookingWindowDays, minNoticeMinutes, leadTimeSurcharge, missing };
}
