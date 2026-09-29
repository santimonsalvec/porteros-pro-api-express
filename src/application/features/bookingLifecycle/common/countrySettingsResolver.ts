import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import type { IBookingSettingsRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';

export interface CountrySettingsResolverDependencies {
  cityRepository: ICityRepository;
  regionRepository: IRegionRepository;
  bookingSettingsRepository: IBookingSettingsRepository;
}

export interface CountrySettings {
  countryId: string | null;
  settings: BookingSettings | null;
}

/**
 * The country-level booking settings of a city (city → region → country), where the per-country
 * values of features 020 and 021 live. Cached per city for the resolver's lifetime — create one
 * per request or per sweep run.
 */
export function createCountrySettingsResolver(deps: CountrySettingsResolverDependencies): (cityId: string) => Promise<CountrySettings> {
  const cache = new Map<string, Promise<CountrySettings>>();
  const resolve = async (cityId: string): Promise<CountrySettings> => {
    const city = await deps.cityRepository.getById(cityId);
    const region = city ? (await deps.regionRepository.getByIds([city.regionId]))[0] : undefined;
    const countryId = region?.countryId ?? null;
    return { countryId, settings: (await deps.bookingSettingsRepository.findFor(cityId, countryId)).country };
  };
  return (cityId) => {
    let found = cache.get(cityId);
    if (!found) {
      found = resolve(cityId);
      cache.set(cityId, found);
    }
    return found;
  };
}
