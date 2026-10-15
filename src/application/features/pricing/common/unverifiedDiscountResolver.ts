import { effectiveDiscount, effectivePriority, VERIFIED_PRIORITY_MINUTES_DEFAULT } from '../../../../domain/pricing/unverifiedDiscount.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IUnverifiedDiscountRepository } from './ports.js';

/** What applies in one zone to goalkeepers without the seal (admin spec 030). */
export interface UnverifiedTerms {
  discountBps: number;
  verifiedPriorityMinutes: number;
}

const DEFAULT_TERMS: UnverifiedTerms = { discountBps: 0, verifiedPriorityMinutes: VERIFIED_PRIORITY_MINUTES_DEFAULT };

/**
 * A zone's terms for goalkeepers without the seal (admin spec 030), field by field: its own, else
 * its anchor city's, else its country's, else the default (no discount, 15 minutes). Any number
 * of zones with one settings read, as the commission resolver does.
 */
export class UnverifiedDiscountResolver {
  constructor(
    private readonly settings: IUnverifiedDiscountRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
  ) {}

  async forZone(zoneId: string): Promise<UnverifiedTerms> {
    return (await this.forZones([zoneId])).get(zoneId) ?? DEFAULT_TERMS;
  }

  async forZones(zoneIds: readonly string[]): Promise<Map<string, UnverifiedTerms>> {
    const result = new Map(zoneIds.map((zoneId) => [zoneId, DEFAULT_TERMS]));
    if (zoneIds.length === 0) return result;
    const zones = await this.zoneRepository.getManyByIds([...zoneIds]);
    const cities = await this.cityRepository.getByIds([...new Set(zones.map((zone) => zone.cityId))]);
    const regions = await this.regionRepository.getByIds([...new Set(cities.map((city) => city.regionId))]);
    const countryOfRegion = new Map(regions.map((region) => [region.id, region.countryId]));
    const countryOfCity = new Map(cities.map((city) => [city.id, countryOfRegion.get(city.regionId) ?? null]));
    const settings = await this.settings.findFor({
      zoneIds: zones.map((zone) => zone.id),
      cityIds: cities.map((city) => city.id),
      countryIds: [...new Set([...countryOfCity.values()].filter((id): id is string => id !== null))],
    });
    const at = (scope: string, refId: string | null) => (refId === null ? undefined : settings.find((setting) => setting.scope === scope && setting.refId === refId));
    for (const zone of zones) {
      const country = countryOfCity.get(zone.cityId) ?? null;
      const levels = [at('zone', zone.id), at('city', zone.cityId), at('country', country)] as const;
      result.set(zone.id, { discountBps: effectiveDiscount(levels).discountBps, verifiedPriorityMinutes: effectivePriority(levels).verifiedPriorityMinutes });
    }
    return result;
  }
}
