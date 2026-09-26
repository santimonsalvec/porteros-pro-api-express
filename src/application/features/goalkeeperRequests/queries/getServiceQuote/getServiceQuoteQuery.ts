import { IQuery } from '../../../../common/mediator/types.js';
import type { DurationMinutes, GoalkeeperCount } from '../../common/bookingLimits.js';
import type { MissingSetting } from '../../common/resolveBookingSettings.js';
import type { ParsedStartsAt } from '../../common/startsAt.js';

export type { MissingSetting } from '../../common/resolveBookingSettings.js';

export interface ServiceQuoteInput {
  latitude: number;
  longitude: number;
  startsAt: ParsedStartsAt;
  goalkeeperCount: GoalkeeperCount;
  durationMinutes: DurationMinutes;
}

export interface ServiceQuote {
  unitRate: number;
  goalkeeperCount: GoalkeeperCount;
  /** `unitRate × goalkeeperCount`. */
  subtotal: number;
  /** The applicable lead-time tier's amount PER GOALKEEPER, else 0. */
  unitSurcharge: number;
  /** `unitSurcharge × goalkeeperCount` — the surcharge is paid once per goalkeeper. */
  surcharge: number;
  /** `subtotal + surcharge`, i.e. `(unitRate + unitSurcharge) × goalkeeperCount`. */
  total: number;
  currency: string;
  /** The resolved start instant, UTC ISO-8601. */
  startsAt: string;
  /** The same instant in the city's time zone, `…±HH:mm`. */
  startsAtLocal: string;
  /** The city's IANA time-zone identifier. */
  timeZone: string;
}

export type InvalidStartTimeReason = 'not_on_slot' | 'nonexistent_local_time' | 'ambiguous_local_time';

export type GetServiceQuoteResult =
  | {
      outcome: 'success';
      quote: ServiceQuote;
      /** Where the point was resolved. Internal: recorded on the stored quote, never serialized. */
      area: { zoneId: string; cityId: string };
    }
  | { outcome: 'location_not_covered' }
  | { outcome: 'time_zone_not_configured'; cityId: string }
  | { outcome: 'invalid_start_time'; reason: InvalidStartTimeReason }
  | { outcome: 'start_time_in_past' }
  | { outcome: 'service_not_configured'; cityId: string; missing: MissingSetting[] }
  | { outcome: 'insufficient_notice'; minNoticeMinutes: number }
  | { outcome: 'outside_booking_window'; bookingWindowDays: number }
  | { outcome: 'rate_not_configured'; zoneId: string; cityId: string; durationMinutes: number };

export class GetServiceQuoteQuery extends IQuery<GetServiceQuoteResult> {
  constructor(public readonly input: ServiceQuoteInput) {
    super();
  }
}
