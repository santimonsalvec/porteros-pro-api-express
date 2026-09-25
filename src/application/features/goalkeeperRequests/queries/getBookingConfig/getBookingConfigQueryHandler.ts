import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository, IRegionRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import {
  DURATION_OPTIONS,
  GOALKEEPER_COUNT_MAX,
  GOALKEEPER_COUNT_MIN,
  SLOT_STEP_MINUTES,
} from '../../common/bookingLimits.js';
import type { IBookingSettingsRepository, ICountryLookup } from '../../common/ports.js';
import { resolveAreaSettings, resolveServiceArea } from '../../common/serviceArea.js';
import { formatLocalIso, toLocalParts } from '../../common/zonedTime.js';
import { GetBookingConfigQuery, type GetBookingConfigResult } from './getBookingConfigQuery.js';

function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * The soonest instant a quote would accept: `now + minNotice`, rounded up to the next slot mark
 * in the city's LOCAL time (so a +05:45 zone rounds to its own :00/:30, not the UTC ones).
 */
function earliestSlot(nowMs: number, minNoticeMinutes: number, timeZone: string): number {
  const earliest = nowMs + minNoticeMinutes * 60_000;
  const local = toLocalParts(earliest, timeZone);
  const pastLastMarkMs = (local.minute % SLOT_STEP_MINUTES) * 60_000 + local.second * 1000 + local.millisecond;
  return pastLastMarkMs === 0 ? earliest : earliest + (SLOT_STEP_MINUTES * 60_000 - pastLastMarkMs);
}

/**
 * Read-only: what a client may pick for a pitch at a given location, so an app can build its
 * selectors without hardcoding limits or using the phone's clock. It resolves the area exactly
 * like the quote does (same shared steps), so it refuses exactly where a quote would refuse.
 */
export class GetBookingConfigQueryHandler implements IQueryHandler<GetBookingConfigQuery, GetBookingConfigResult> {
  constructor(
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
    private readonly countryLookup: ICountryLookup,
    private readonly bookingSettingsRepository: IBookingSettingsRepository,
    private readonly clock: IClock,
  ) {}

  async handle(query: GetBookingConfigQuery): Promise<GetBookingConfigResult> {
    const { latitude, longitude } = query.input;
    const nowMs = this.clock.now().getTime();

    const area = await resolveServiceArea(this.zoneRepository, this.cityRepository, latitude, longitude);
    if (area.outcome !== 'ok') return area;
    const { city, timeZone } = area;

    const settings = await resolveAreaSettings(
      {
        regionRepository: this.regionRepository,
        countryLookup: this.countryLookup,
        bookingSettingsRepository: this.bookingSettingsRepository,
      },
      city,
    );
    if (!settings.ok) return { outcome: 'service_not_configured', cityId: city.id, missing: settings.missing };
    const { currency, bookingWindowDays, minNoticeMinutes } = settings;

    // The bookable local dates: today in the city's zone, then the next N−1 calendar days.
    const today = toLocalParts(nowMs, timeZone);
    const availableDates = Array.from({ length: bookingWindowDays }, (_, day) =>
      isoDate(Date.UTC(today.year, today.month - 1, today.day + day)),
    );

    const earliestMs = earliestSlot(nowMs, minNoticeMinutes, timeZone);
    const earliestLocal = toLocalParts(earliestMs, timeZone);
    const earliestDate = isoDate(Date.UTC(earliestLocal.year, earliestLocal.month - 1, earliestLocal.day));

    return {
      outcome: 'success',
      config: {
        timeZone,
        now: formatLocalIso(nowMs, timeZone),
        bookingWindowDays,
        availableDates,
        minNoticeMinutes,
        slotStepMinutes: SLOT_STEP_MINUTES,
        earliestStartsAt: availableDates.includes(earliestDate) ? formatLocalIso(earliestMs, timeZone) : null,
        goalkeeperCount: { min: GOALKEEPER_COUNT_MIN, max: GOALKEEPER_COUNT_MAX },
        durationOptions: [...DURATION_OPTIONS],
        currency,
      },
    };
  }
}
