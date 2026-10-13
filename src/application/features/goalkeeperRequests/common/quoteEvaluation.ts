import type { City } from '../../../../domain/locations/city.js';
import type { MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { Zone } from '../../../../domain/zones/zone.js';
import type { IRegionRepository } from '../../locations/common/ports.js';
import type { ICommissionResolver } from '../../wallet/common/ports.js';
import { SLOT_STEP_MINUTES } from './bookingLimits.js';
import { computeAmounts, selectSurchargeTier, selectUnitRate } from './pricing.js';
import type { IBookingSettingsRepository, ICountryLookup, IRentalRateRepository } from './ports.js';
import type { MissingSetting } from './resolveBookingSettings.js';
import { resolveAreaSettings } from './serviceArea.js';
import type { ParsedStartsAt } from './startsAt.js';
import { formatLocalIso, localDayNumber, resolveLocalDateTime, toLocalParts } from './zonedTime.js';

export interface QuoteEvaluationDependencies {
  regionRepository: IRegionRepository;
  countryLookup: ICountryLookup;
  rentalRateRepository: IRentalRateRepository;
  bookingSettingsRepository: IBookingSettingsRepository;
  commissionResolver: Pick<ICommissionResolver, 'resolveForMatch'>;
}

export interface AreaQuoteInput {
  zone: Zone;
  /** The anchor city that owns the zone: its time zone, rate fallback and settings scope. */
  city: City;
  timeZone: string;
  startsAt: ParsedStartsAt;
  goalkeeperCount: number;
  durationMinutes: number;
  match: MatchTier;
  /** "Now" for every rule: the clock for a quote, the chosen moment for the admin's simulator. */
  nowMs: number;
}

export type InvalidStartTimeReason = 'not_on_slot' | 'nonexistent_local_time' | 'ambiguous_local_time';

export type AreaQuoteResult =
  | {
      outcome: 'priced';
      unitRate: number;
      subtotal: number;
      unitSurcharge: number;
      surcharge: number;
      total: number;
      currency: string;
      startEpochMs: number;
      startsAtLocal: string;
      commission: number;
      freeCancellationMinutes: number | null;
      travelBufferMinutes: number | null;
    }
  | { outcome: 'invalid_start_time'; reason: InvalidStartTimeReason }
  | { outcome: 'start_time_in_past' }
  | { outcome: 'service_not_configured'; cityId: string; missing: MissingSetting[] }
  | { outcome: 'insufficient_notice'; minNoticeMinutes: number }
  | { outcome: 'outside_booking_window'; bookingWindowDays: number }
  | { outcome: 'rate_not_configured'; zoneId: string; cityId: string; durationMinutes: number };

type StartInstant = { kind: 'ok'; epochMs: number } | { kind: 'invalid'; reason: InvalidStartTimeReason };

/** With an explicit offset the instant is fixed; without one the wall-clock time is read in the city's zone. */
export function resolveStartInstant(startsAt: ParsedStartsAt, timeZone: string): StartInstant {
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
 * Prices a match in a known area — the quote's steps (3) to (9), research.md §11 of feature 010:
 * the first failing rule is the one reported. Shared by the quote and the admin's simulator
 * (admin spec 004, research §1), so both judge an area the same way. Read-only.
 */
export async function evaluateQuoteInArea(deps: QuoteEvaluationDependencies, input: AreaQuoteInput): Promise<AreaQuoteResult> {
  const { zone, city, timeZone, startsAt, goalkeeperCount, durationMinutes, match, nowMs } = input;

  // (3) The start instant, read in the city's own time zone.
  const start = resolveStartInstant(startsAt, timeZone);
  if (start.kind === 'invalid') return { outcome: 'invalid_start_time', reason: start.reason };
  const startEpochMs = start.epochMs;

  // (3b) The start must sit on a local slot mark (:00 or :30) — judged in the city's own time, so
  //      half-hour and 45-minute offsets (India, Nepal) are handled correctly.
  const startLocal = toLocalParts(startEpochMs, timeZone);
  if (startLocal.minute % SLOT_STEP_MINUTES !== 0 || startLocal.second !== 0 || startLocal.millisecond !== 0) {
    return { outcome: 'invalid_start_time', reason: 'not_on_slot' };
  }

  // (3c) In the past? Needs no configuration, so it is reported even in an unconfigured area.
  if (startEpochMs < nowMs) return { outcome: 'start_time_in_past' };

  // (4)(5)(6) The rates for this duration, and the area's settings + currency (city → region →
  //          country), in parallel. Every setting must be defined at the city or its country — no
  //          built-in defaults — and the country must say which currency its prices are in.
  //          The platform commission is fixed here too, for the whole flow (012): no commission, no
  //          quote — a booking nobody could be offered must not be sold.
  const [rates, areaSettings, commission] = await Promise.all([
    deps.rentalRateRepository.findForDuration(zone.id, city.id, durationMinutes),
    resolveAreaSettings(deps, city),
    deps.commissionResolver.resolveForMatch(zone.id, match),
  ]);
  if (!areaSettings.ok || commission === null) {
    const missing: MissingSetting[] = [...(areaSettings.ok ? [] : areaSettings.missing), ...(commission === null ? ['commission' as const] : [])];
    return { outcome: 'service_not_configured', cityId: city.id, missing };
  }
  const { currency, bookingWindowDays, minNoticeMinutes, leadTimeSurcharge, freeCancellationMinutes, travelBufferMinutes } = areaSettings;

  // (6b) Minimum notice, on real elapsed time. Exactly the minimum is accepted.
  if (startEpochMs - nowMs < minNoticeMinutes * 60_000) return { outcome: 'insufficient_notice', minNoticeMinutes };

  // (6c) Booking window: N days = today plus the next N−1 LOCAL calendar days in the city's zone.
  const daysAhead = localDayNumber(startLocal) - localDayNumber(toLocalParts(nowMs, timeZone));
  if (daysAhead > bookingWindowDays - 1) return { outcome: 'outside_booking_window', bookingWindowDays };

  // (7) The unit rate: the zone's own rates, else the city's — decided per duration, since
  //     the repository already filtered on the requested one, then by modality + level →
  //     modality → general within each (feature 024). None ⇒ refused, never free.
  const rate = selectUnitRate(rates, match);
  if (!rate) return { outcome: 'rate_not_configured', zoneId: zone.id, cityId: city.id, durationMinutes };

  // (8) Lead-time surcharge, on real elapsed time. The tier's amount is per goalkeeper.
  const leadMinutes = (startEpochMs - nowMs) / 60_000;
  const unitSurcharge = selectSurchargeTier(leadTimeSurcharge.tiers, leadMinutes)?.amount ?? 0;

  // (9) Totals: the rate and the surcharge are each charged once per goalkeeper.
  const { subtotal, surcharge, total } = computeAmounts(rate.amount, goalkeeperCount, unitSurcharge);
  return {
    outcome: 'priced',
    unitRate: rate.amount,
    subtotal,
    unitSurcharge,
    surcharge,
    total,
    currency,
    startEpochMs,
    startsAtLocal: formatLocalIso(startEpochMs, timeZone),
    commission,
    freeCancellationMinutes,
    travelBufferMinutes,
  };
}
