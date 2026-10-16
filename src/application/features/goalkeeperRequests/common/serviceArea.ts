import type { BookingSettings, LeadTimeSurcharge } from '../../../../domain/pricing/bookingSettings.js';
import type { Country } from '../../../../domain/countries/country.js';
import type { Market } from '../../../../domain/markets/market.js';
import { InvalidConfigurationError } from '../../../../domain/pricing/invalidConfigurationError.js';
import type { Zone } from '../../../../domain/zones/zone.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IBookingSettingsRepository, ICountryLookup } from './ports.js';
import { resolveBookingSettings, type MissingSetting } from './resolveBookingSettings.js';
import { isValidTimeZone } from './zonedTime.js';

/**
 * The two resolution steps every goalkeeper-request query shares — the quote and the
 * booking-config endpoint — so the two can never disagree about which area a point is in
 * or whether that area is configured. Read-only.
 */

export type ServiceAreaResult =
  | { outcome: 'ok'; zone: Zone; market: Market; timeZone: string }
  | { outcome: 'location_not_covered' }
  /** The point is in a market that operates but is out of service there now (spec 031, FR-011). */
  | { outcome: 'market_unavailable'; market: Market };

async function marketOf(marketRepository: Pick<IMarketRepository, 'getById'>, zone: Zone): Promise<Market> {
  const market = await marketRepository.getById(zone.marketId);
  if (!market) throw new InvalidConfigurationError(`zones document ${zone.id}: market ${zone.marketId} does not exist`);
  return market;
}

/**
 * Which active zone contains the point and the market that owns it, with its time zone (spec 031,
 * research §8). A draft market is not covered yet. A disabled market, or an inactive zone of a
 * market that has operated, is "temporarily unavailable" instead, so the client learns why.
 */
export async function resolveServiceArea(
  zoneRepository: IZoneRepository,
  marketRepository: Pick<IMarketRepository, 'getById'>,
  latitude: number,
  longitude: number,
): Promise<ServiceAreaResult> {
  const zone = await zoneRepository.findActiveContainingPoint(latitude, longitude);
  if (!zone) {
    const inactive = await zoneRepository.findAnyContainingPoint(latitude, longitude);
    if (!inactive) return { outcome: 'location_not_covered' };
    const market = await marketOf(marketRepository, inactive);
    return market.status === 'draft' ? { outcome: 'location_not_covered' } : { outcome: 'market_unavailable', market };
  }

  const market = await marketOf(marketRepository, zone);
  if (market.status === 'draft') return { outcome: 'location_not_covered' };
  if (market.status === 'disabled') return { outcome: 'market_unavailable', market };
  if (!isValidTimeZone(market.timeZone)) {
    throw new InvalidConfigurationError(`markets document ${market.id}: '${market.timeZone}' is not a valid IANA time zone`);
  }
  return { outcome: 'ok', zone, market, timeZone: market.timeZone };
}

export interface AreaSettingsDependencies {
  countryLookup: ICountryLookup;
  bookingSettingsRepository: IBookingSettingsRepository;
}

export type AreaSettingsResult =
  | {
      ok: true;
      currency: string;
      bookingWindowDays: number;
      minNoticeMinutes: number;
      leadTimeSurcharge: LeadTimeSurcharge;
      /** `null` when not configured: the caller applies the default (FR-014). */
      freeCancellationMinutes: number | null;
      /** `null` when not configured: the caller applies the default (FR-010 of 012). */
      travelBufferMinutes: number | null;
    }
  | { ok: false; missing: MissingSetting[] };

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * The booking rules of a market: the settings at the market or its country (no built-in
 * defaults) and the country's currency. `ok: false` lists exactly what is missing. A currency
 * written in the wrong form is broken configuration (throws).
 */
export async function resolveAreaSettings(deps: AreaSettingsDependencies, market: Market): Promise<AreaSettingsResult> {
  const [settingsDocuments, country] = await Promise.all([
    deps.bookingSettingsRepository.findFor(market.id, market.countryId),
    deps.countryLookup.getById(market.countryId),
  ]);
  return areaSettingsFrom(settingsDocuments, country);
}

/**
 * The booking rules of an area from its documents already read: the market's and its country's
 * settings, and the country (its currency). Shared with the admin's readiness, which reads many
 * areas at once, so both judge an area the same way.
 */
export function areaSettingsFrom(
  settingsDocuments: { market: BookingSettings | null; country: BookingSettings | null },
  country: Country | null,
): AreaSettingsResult {
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
    return { ok: false, missing: currency === null ? [...settings.missing, 'currency'] : settings.missing };
  }
  return {
    ok: true,
    currency,
    bookingWindowDays,
    minNoticeMinutes,
    leadTimeSurcharge,
    freeCancellationMinutes: settings.freeCancellationMinutes,
    travelBufferMinutes: settings.travelBufferMinutes,
  };
}
