import { ALL_MATCH_TIERS, resolveTiered, type MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { CommissionSetting } from '../../../../domain/operatingBalance/commissionSetting.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ICommissionResolver, ICommissionSettingRepository } from './ports.js';

/** Each zone's commission documents by geographic level, most specific first. */
type CommissionLevels = Map<string, CommissionSetting[][]>;

/**
 * A zone's effective commission: its own, else its anchor market's, else its country's (FR-009);
 * `null` when none is configured (FR-010). Within each level the modality tiers apply
 * (feature 024). Resolves any number of zones with one settings read.
 */
export class CommissionResolver implements ICommissionResolver {
  constructor(
    private readonly settings: ICommissionSettingRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly marketRepository: Pick<IMarketRepository, 'getByIds'>,
  ) {}

  /**
   * The lowest commission any match in each zone could carry, over every modality:
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
    return (await this.resolveSettingForMatch(zoneId, match))?.amount ?? null;
  }

  /** The document that sets that commission: the admin's simulator shows its level and tier (spec 004). */
  async resolveSettingForMatch(zoneId: string, match: MatchTier): Promise<CommissionSetting | null> {
    const levels = await this.levelsFor([zoneId]);
    return resolveTiered(levels.get(zoneId) ?? [], match);
  }

  private async levelsFor(zoneIds: string[]): Promise<CommissionLevels> {
    const result: CommissionLevels = new Map();
    if (zoneIds.length === 0) return result;

    const zones = await this.zoneRepository.getManyByIds(zoneIds);
    const marketIds = [...new Set(zones.map((zone) => zone.marketId))];
    const markets = await this.marketRepository.getByIds(marketIds);
    const countryOfMarket = new Map<string, string | null>(markets.map((market) => [market.id, market.countryId]));
    const countryIds = [...new Set([...countryOfMarket.values()].filter((id): id is string => id !== null))];

    const settings = await this.settings.findFor({ zoneIds: zones.map((zone) => zone.id), marketIds, countryIds });
    const settingsOf = (scope: string, refId: string | null) =>
      refId === null ? [] : settings.filter((setting) => setting.scope === scope && setting.refId === refId);

    for (const zone of zones) {
      result.set(zone.id, [
        settingsOf('zone', zone.id),
        settingsOf('market', zone.marketId),
        settingsOf('country', countryOfMarket.get(zone.marketId) ?? null),
      ]);
    }
    return result;
  }
}
