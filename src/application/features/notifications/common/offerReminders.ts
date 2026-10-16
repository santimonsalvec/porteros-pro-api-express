import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import { resolveLayered, type Resolved } from '../../../../domain/settings/layered.js';

/** How often an open offer is pushed again, and how many times. */
export interface OfferReminderValues {
  maxReminders: number;
  intervalMinutes: number;
}

export interface ResolvedOfferReminders {
  maxReminders: Resolved<number>;
  intervalMinutes: Resolved<number>;
}

/**
 * The reminder values of a market (spec 031, FR-017, research §6): the market's, else its
 * country's, else the platform's, which are the environment values.
 */
export function resolveOfferReminders(
  found: { market: BookingSettings | null; country: BookingSettings | null },
  platform: OfferReminderValues,
): ResolvedOfferReminders {
  return {
    maxReminders: resolveLayered({ market: found.market?.offerMaxReminders, country: found.country?.offerMaxReminders }, platform.maxReminders),
    intervalMinutes: resolveLayered(
      { market: found.market?.offerReminderIntervalMinutes, country: found.country?.offerReminderIntervalMinutes },
      platform.intervalMinutes,
    ),
  };
}
