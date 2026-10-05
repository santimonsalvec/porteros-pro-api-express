import { ALL_MATCH_TIERS, resolveTiered, type MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { CommissionSetting } from '../../../../domain/wallet/commissionSetting.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ICommissionResolver, ICommissionSettingRepository } from './ports.js';

/** Each zone's commission documents by geographic level, most specific first. */
type CommissionLevels = Map<string, CommissionSetting[][]>;

/**
 * A zone's effective commission: its own, else its anchor city's, else its country's (FR-009);
 * `null` when none is configured (FR-010). Within each level the modality/level tiers apply
 * (feature 024). Resolves any number of zones with one settings read.
 */
export class CommissionResolver implements ICommissionResolver {
  constructor(
    private readonly settings: ICommissionSettingRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly regionRepository: IRegionRepository,
  ) {}

  /**
   * The lowest commission any match in each zone could carry, over every modality and level:
   * the balance a goalkeeper needs to see at least some offers there.
   */
  async resolveForZones(zoneIds: string[]): Promise<Map<string, number | null>> {
    const levels = await this.levelsFor(zoneIds);
    const result = new Map<string, number | null>();
    for (const zoneId of zoneIds) {
      const zoneLevels = levels.get(zoneId) ?? [];
      const amounts = ALL_MATCH_TIERS.map((tier) => resolveTiered(zoneLevels, tier)?.amount).filter(
        (amount): amount is number => amount !== undefined,
      );
      result.set(zoneId, amounts.length === 0 ? null : Math.min(...amounts));
    }
    return result;
  }

  /** The commission of one match in this zone, `null` when none is configured. */
  async resolveForMatch(zoneId: string, match: MatchTier): Promise<number | null> {
    const levels = await this.levelsFor([zoneId]);
    return resolveTiered(levels.get(zoneId) ?? [], match)?.amount ?? null;
  }

  private async levelsFor(zoneIds: string[]): Promise<CommissionLevels> {
    const result: CommissionLevels = new Map();
    if (zoneIds.length === 0) return result;

    const zones = await this.zoneRepository.getManyByIds(zoneIds);
    const cityIds = [...new Set(zones.map((zone) => zone.cityId))];
    const cities = await this.cityRepository.getByIds(cityIds);
    const regions = await this.regionRepository.getByIds([...new Set(cities.map((city) => city.regionId))]);
    const countryOfRegion = new Map(regions.map((region) => [region.id, region.countryId]));
    const countryOfCity = new Map(cities.map((city) => [city.id, countryOfRegion.get(city.regionId) ?? null]));
    const countryIds = [...new Set([...countryOfCity.values()].filter((id): id is string => id !== null))];

    const settings = await this.settings.findFor({ zoneIds: zones.map((zone) => zone.id), cityIds, countryIds });
    const settingsOf = (scope: string, refId: string | null) =>
      refId === null ? [] : settings.filter((setting) => setting.scope === scope && setting.refId === refId);

    for (const zone of zones) {
      result.set(zone.id, [
        settingsOf('zone', zone.id),
        settingsOf('city', zone.cityId),
        settingsOf('country', countryOfCity.get(zone.cityId) ?? null),
      ]);
    }
    return result;
  }
}
