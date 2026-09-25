import type { City } from '../../../../domain/locations/city.js';
import type { LeadTimeSurcharge } from '../../../../domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../../domain/pricing/invalidConfigurationError.js';
import type { Zone } from '../../../../domain/zones/zone.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';
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
  | { outcome: 'ok'; zone: Zone; city: City; timeZone: string }
  | { outcome: 'location_not_covered' }
  | { outcome: 'time_zone_not_configured'; cityId: string };

/** Which active zone contains the point, and the (anchor) city that owns it, with its time zone. */
export async function resolveServiceArea(
  zoneRepository: IZoneRepository,
  cityRepository: ICityRepository,
  latitude: number,
  longitude: number,
): Promise<ServiceAreaResult> {
  const zone = await zoneRepository.findActiveContainingPoint(latitude, longitude);
  if (!zone) return { outcome: 'location_not_covered' };

  const city = await cityRepository.getById(zone.cityId);
  if (!city) throw new Error(`Zone ${zone.id} references city ${zone.cityId}, which does not exist.`);
  if (city.timeZone === null) return { outcome: 'time_zone_not_configured', cityId: city.id };
  if (!isValidTimeZone(city.timeZone)) {
    throw new InvalidConfigurationError(`cities document ${city.id}: '${city.timeZone}' is not a valid IANA time zone`);
  }
  return { outcome: 'ok', zone, city, timeZone: city.timeZone };
}

export interface AreaSettingsDependencies {
  regionRepository: IRegionRepository;
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
    }
  | { ok: false; missing: MissingSetting[] };

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * The booking rules of a city's area: city → region → country, the settings at the city or
 * its country (no built-in defaults) and the country's currency. `ok: false` lists exactly
 * what is missing. A currency written in the wrong form is broken configuration (throws).
 */
export async function resolveAreaSettings(deps: AreaSettingsDependencies, city: City): Promise<AreaSettingsResult> {
  // The country is found through the city's region; a region with no country recorded leaves it
  // unknown, so only city-level settings can apply (and no currency is known).
  const countryId = (await deps.regionRepository.getByIds([city.regionId]))[0]?.countryId ?? null;

  const [settingsDocuments, country] = await Promise.all([
    deps.bookingSettingsRepository.findFor(city.id, countryId),
    countryId === null ? Promise.resolve(null) : deps.countryLookup.getById(countryId),
  ]);

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
  return { ok: true, currency, bookingWindowDays, minNoticeMinutes, leadTimeSurcharge };
}
