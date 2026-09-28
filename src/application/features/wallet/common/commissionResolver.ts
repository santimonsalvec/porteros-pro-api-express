import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ICommissionResolver, ICommissionSettingRepository } from './ports.js';

/**
 * A zone's effective commission: its own, else its anchor city's, else its country's (FR-009);
 * `null` when none is configured (FR-010). Resolves any number of zones with one settings read.
 */
export class CommissionResolver implements ICommissionResolver {
  constructor(
    private readonly settings: ICommissionSettingRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
  ) {}

  async resolveForZones(zoneIds: string[]): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>(zoneIds.map((id) => [id, null]));
    if (zoneIds.length === 0) return result;

    const zones = await this.zoneRepository.getManyByIds(zoneIds);
    const cityIds = [...new Set(zones.map((zone) => zone.cityId))];
    const cities = await this.cityRepository.getByIds(cityIds);
    const regions = await this.regionRepository.getByIds([...new Set(cities.map((city) => city.regionId))]);
    const countryOfRegion = new Map(regions.map((region) => [region.id, region.countryId]));
    const countryOfCity = new Map(cities.map((city) => [city.id, countryOfRegion.get(city.regionId) ?? null]));
    const countryIds = [...new Set([...countryOfCity.values()].filter((id): id is string => id !== null))];

    const settings = await this.settings.findFor({ zoneIds: zones.map((zone) => zone.id), cityIds, countryIds });
    const amountOf = (scope: string, refId: string | null) =>
      refId === null ? undefined : settings.find((setting) => setting.scope === scope && setting.refId === refId)?.amount;

    for (const zone of zones) {
      result.set(
        zone.id,
        amountOf('zone', zone.id) ?? amountOf('city', zone.cityId) ?? amountOf('country', countryOfCity.get(zone.cityId) ?? null) ?? null,
      );
    }
    return result;
  }
}
