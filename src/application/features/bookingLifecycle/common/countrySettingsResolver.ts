import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import type { IBookingSettingsRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../markets/common/ports.js';

export interface CountrySettingsResolverDependencies {
  marketRepository: Pick<IMarketRepository, 'getById'>;
  bookingSettingsRepository: IBookingSettingsRepository;
}

export interface CountrySettings {
  countryId: string | null;
  /** The country-level document, where the values only a country sets live (penalties). */
  settings: BookingSettings | null;
  /** The market-level document, which may override the country (spec 031, FR-014). */
  marketSettings: BookingSettings | null;
}

/**
 * The booking settings of a market and of its country, where the values of features 020 and
 * 021 live. Cached per market for the resolver's lifetime — create one per request or per sweep run.
 */
export function createCountrySettingsResolver(deps: CountrySettingsResolverDependencies): (marketId: string) => Promise<CountrySettings> {
  const cache = new Map<string, Promise<CountrySettings>>();
  const resolve = async (marketId: string): Promise<CountrySettings> => {
    const market = await deps.marketRepository.getById(marketId);
    const countryId = market?.countryId ?? null;
    const found = await deps.bookingSettingsRepository.findFor(marketId, countryId);
    return { countryId, settings: found.country, marketSettings: found.market };
  };
  return (marketId) => {
    let found = cache.get(marketId);
    if (!found) {
      found = resolve(marketId);
      cache.set(marketId, found);
    }
    return found;
  };
}
