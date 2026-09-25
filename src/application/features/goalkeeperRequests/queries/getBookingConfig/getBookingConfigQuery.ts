import { IQuery } from '../../../../common/mediator/types.js';
import type { DurationMinutes, GoalkeeperCount } from '../../common/bookingLimits.js';
import type { MissingSetting } from '../../common/resolveBookingSettings.js';

export interface BookingConfig {
  /** The city's IANA time zone. */
  timeZone: string;
  /** "Now" as the server sees it, in the city's local time with its offset (`…±HH:mm`). */
  now: string;
  /** Today plus the next `bookingWindowDays − 1` local calendar days. */
  bookingWindowDays: number;
  /** The bookable local dates (`YYYY-MM-DD`), starting today, in the city's time zone. */
  availableDates: string[];
  /** Minimum notice before the start, in minutes. */
  minNoticeMinutes: number;
  /** Start times sit on multiples of this many minutes (local :00 and :30). */
  slotStepMinutes: number;
  /**
   * The soonest start a quote accepts right now (local time with offset): now plus the minimum
   * notice, rounded up to the next slot mark. `null` when that moment is already outside the
   * booking window, i.e. nothing can be booked at the moment.
   */
  earliestStartsAt: string | null;
  goalkeeperCount: { min: GoalkeeperCount; max: GoalkeeperCount };
  durationOptions: DurationMinutes[];
  /** The currency of the country (`COP`); every quote amount is in it. */
  currency: string;
}

export type GetBookingConfigResult =
  | { outcome: 'success'; config: BookingConfig }
  | { outcome: 'location_not_covered' }
  | { outcome: 'time_zone_not_configured'; cityId: string }
  | { outcome: 'service_not_configured'; cityId: string; missing: MissingSetting[] };

export class GetBookingConfigQuery extends IQuery<GetBookingConfigResult> {
  constructor(public readonly input: { latitude: number; longitude: number }) {
    super();
  }
}
