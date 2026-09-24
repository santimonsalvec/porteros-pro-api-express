import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { InvalidConfigurationError } from '../../../../../domain/pricing/invalidConfigurationError.js';
import type { ICityRepository, IRegionRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { IBookingSettingsRepository, ICountryLookup, IRentalRateRepository } from '../../common/ports.js';
import { computeAmounts, selectSurchargeTier, selectUnitRate } from '../../common/pricing.js';
import { resolveBookingSettings } from '../../common/resolveBookingSettings.js';
import type { ParsedStartsAt } from '../../common/startsAt.js';
import { formatLocalIso, isValidTimeZone, localDayNumber, resolveLocalDateTime, toLocalParts } from '../../common/zonedTime.js';
import {
  GetServiceQuoteQuery,
  type GetServiceQuoteResult,
  type InvalidStartTimeReason,
} from './getServiceQuoteQuery.js';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

type StartInstant = { kind: 'ok'; epochMs: number } | { kind: 'invalid'; reason: InvalidStartTimeReason };

/** With an explicit offset the instant is fixed; without one the wall-clock time is read in the city's zone. */
function resolveStartInstant(startsAt: ParsedStartsAt, timeZone: string): StartInstant {
  const { local, offsetMinutes } = startsAt;
  if (offsetMinutes !== null) {
    const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond);
    return { kind: 'ok', epochMs: asIfUtc - offsetMinutes * 60_000 };
  }
  const resolved = resolveLocalDateTime(local, timeZone);
  if (resolved.kind === 'ok') return { kind: 'ok', epochMs: resolved.epochMs };
  return { kind: 'invalid', reason: resolved.kind === 'nonexistent' ? 'nonexistent_local_time' : 'ambiguous_local_time' };
}

/**
 * Read-only: prices a goalkeeper booking. Evaluation follows research.md §11 — the
 * first failing rule is the one reported. Nothing here writes to any repository (FR-020).
 */
export class GetServiceQuoteQueryHandler implements IQueryHandler<GetServiceQuoteQuery, GetServiceQuoteResult> {
  constructor(
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
    private readonly countryLookup: ICountryLookup,
    private readonly rentalRateRepository: IRentalRateRepository,
    private readonly bookingSettingsRepository: IBookingSettingsRepository,
    private readonly clock: IClock,
  ) {}

  async handle(query: GetServiceQuoteQuery): Promise<GetServiceQuoteResult> {
    const { latitude, longitude, startsAt, goalkeeperCount, durationMinutes } = query.input;
    // One reading of "now" for the whole evaluation, so every rule sees the same moment.
    const nowMs = this.clock.now().getTime();

    // (1) Which active zone contains the point?
    const zone = await this.zoneRepository.findActiveContainingPoint(latitude, longitude);
    if (!zone) return { outcome: 'location_not_covered' };

    // (2) The zone's (anchor) city supplies the time zone, the rate fallback and the settings scope.
    const city = await this.cityRepository.getById(zone.cityId);
    if (!city) throw new Error(`Zone ${zone.id} references city ${zone.cityId}, which does not exist.`);
    if (city.timeZone === null) return { outcome: 'time_zone_not_configured', cityId: city.id };
    if (!isValidTimeZone(city.timeZone)) {
      throw new InvalidConfigurationError(`cities document ${city.id}: '${city.timeZone}' is not a valid IANA time zone`);
    }
    const timeZone = city.timeZone;

    // (3) The start instant, read in the city's own time zone.
    const start = resolveStartInstant(startsAt, timeZone);
    if (start.kind === 'invalid') return { outcome: 'invalid_start_time', reason: start.reason };
    const startEpochMs = start.epochMs;

    // (3b) The start must sit on a local :00 or :30 — judged in the city's own time, so
    //      half-hour and 45-minute offsets (India, Nepal) are handled correctly.
    const startLocal = toLocalParts(startEpochMs, timeZone);
    if ((startLocal.minute !== 0 && startLocal.minute !== 30) || startLocal.second !== 0 || startLocal.millisecond !== 0) {
      return { outcome: 'invalid_start_time', reason: 'not_on_slot' };
    }

    // (3c) In the past? Needs no configuration, so it is reported even in an unconfigured area.
    if (startEpochMs < nowMs) return { outcome: 'start_time_in_past' };

    // (4) The country, found through the city's region (city → region → country). A region
    //     with no country recorded leaves it unknown, so only city-level settings can apply.
    const countryId = (await this.regionRepository.getByIds([city.regionId]))[0]?.countryId ?? null;

    // (5) Rates for this duration, the settings documents and the country (its currency), in parallel.
    const [rates, settingsDocuments, country] = await Promise.all([
      this.rentalRateRepository.findForDuration(zone.id, city.id, durationMinutes),
      this.bookingSettingsRepository.findFor(city.id, countryId),
      countryId === null ? Promise.resolve(null) : this.countryLookup.getById(countryId),
    ]);

    // (6) Every setting must be defined at the city or its country — no built-in defaults — and
    //     the country must say which currency its prices are in. A currency written in the wrong
    //     form is broken configuration, not a silent skip.
    const currency = country?.currency ?? null;
    if (currency !== null && !CURRENCY_PATTERN.test(currency)) {
      throw new InvalidConfigurationError(`countries document ${country?.id}: '${currency}' is not a 3-letter uppercase currency code`);
    }
    const settings = resolveBookingSettings(settingsDocuments);
    const { bookingWindowDays, minNoticeMinutes, leadTimeSurcharge } = settings;
    if (
      settings.missing.length > 0 ||
      currency === null ||
      bookingWindowDays === null ||
      minNoticeMinutes === null ||
      leadTimeSurcharge === null
    ) {
      return {
        outcome: 'service_not_configured',
        cityId: city.id,
        missing: currency === null ? [...settings.missing, 'currency'] : settings.missing,
      };
    }

    // (6b) Minimum notice, on real elapsed time. Exactly the minimum is accepted.
    if (startEpochMs - nowMs < minNoticeMinutes * 60_000) return { outcome: 'insufficient_notice', minNoticeMinutes };

    // (6c) Booking window: N days = today plus the next N−1 LOCAL calendar days in the city's zone.
    const daysAhead = localDayNumber(startLocal) - localDayNumber(toLocalParts(nowMs, timeZone));
    if (daysAhead > bookingWindowDays - 1) return { outcome: 'outside_booking_window', bookingWindowDays };

    // (7) The unit rate: the zone's own rate, else the city's — decided per duration, since
    //     the repository already filtered on the requested one. Neither ⇒ refused, never free.
    const rate = selectUnitRate(rates);
    if (!rate) return { outcome: 'rate_not_configured', zoneId: zone.id, cityId: city.id, durationMinutes };

    // (8) Lead-time surcharge, on real elapsed time.
    const leadMinutes = (startEpochMs - nowMs) / 60_000;
    const surcharge = selectSurchargeTier(leadTimeSurcharge.tiers, leadMinutes)?.amount ?? 0;

    // (9) Totals.
    const { subtotal, total } = computeAmounts(rate.amount, goalkeeperCount, surcharge);
    return {
      outcome: 'success',
      quote: {
        unitRate: rate.amount,
        goalkeeperCount,
        subtotal,
        surcharge,
        total,
        currency,
        startsAt: new Date(startEpochMs).toISOString(),
        startsAtLocal: formatLocalIso(startEpochMs, timeZone),
        timeZone,
      },
    };
  }
}
