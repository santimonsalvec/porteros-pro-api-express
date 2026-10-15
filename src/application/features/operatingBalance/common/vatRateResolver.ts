import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';
import type { ITaxSettingsRepository, IVatRateResolver } from './ports.js';

export interface VatRateLogger {
  warn(entry: Record<string, unknown>, message: string): void;
}

/**
 * A country's VAT rate (feature 023, research.md §4). A country without a setting charges no VAT;
 * that's logged, since it's usually a configuration the administrator hasn't done yet.
 */
export function createVatRateResolver(
  repository: ITaxSettingsRepository,
  locations: { cityRepository: ICityRepository; regionRepository: IRegionRepository },
  logger: VatRateLogger,
): IVatRateResolver {
  const resolver: IVatRateResolver = {
    async forCity(cityId: string): Promise<number> {
      const city = await locations.cityRepository.getById(cityId);
      const region = city ? (await locations.regionRepository.getByIds([city.regionId]))[0] : undefined;
      return region?.countryId ? resolver.forCountry(region.countryId) : 0;
    },
    async forCountry(countryId: string): Promise<number> {
      const setting = await repository.getByCountry(countryId);
      if (!setting) {
        logger.warn({ outcome: 'vat_not_configured', countryId }, 'No VAT rate configured for the country; charging 0 %');
        return 0;
      }
      return setting.vatRateBps;
    },
  };
  return resolver;
}
