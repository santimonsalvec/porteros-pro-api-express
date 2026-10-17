import { ALL_MATCH_TIERS, resolveTiered, type MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { RentalRate } from '../../../../domain/pricing/rentalRate.js';
import { commissionFor } from '../../../../domain/operatingBalance/commissionRule.js';
import type { CommissionSetting } from '../../../../domain/operatingBalance/commissionSetting.js';
import type { Zone } from '../../../../domain/zones/zone.js';
import type { IRentalRateRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { CommissionViewer, GoalkeeperThreshold, ICommissionResolver, ICommissionSettingRepository } from './ports.js';

/** One zone with the country its market belongs to. */
interface PlacedZone {
  zone: Zone;
  countryId: string | null;
}

/**
 * A match's effective rule: the viewer's own active rule, else the zone's, else its market's, else
 * its country's (FR-008/FR-010a); `null` when none is configured. Within each level the modality
 * tiers apply (feature 024). Resolves any number of zones and goalkeepers with one settings read.
 */
export class CommissionResolver implements ICommissionResolver {
  constructor(
    private readonly settings: ICommissionSettingRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly marketRepository: Pick<IMarketRepository, 'getByIds'>,
    private readonly rentalRates?: Pick<IRentalRateRepository, 'findForZones'>,
  ) {}

  async resolveForMatch(zoneId: string, match: MatchTier, viewer?: CommissionViewer): Promise<CommissionSetting | null> {
    const places = await this.place([zoneId]);
    const placed = places.get(zoneId);
    if (!placed) return null;
    const settings = await this.settings.findFor({
      zoneIds: [placed.zone.id],
      marketIds: [placed.zone.marketId],
      countryIds: placed.countryId ? [placed.countryId] : [],
      goalkeeperIds: viewer ? [viewer.goalkeeperId] : [],
    });
    return resolveTiered(this.levelsOf(placed, settings, viewer), match);
  }

  async lowestForGoalkeepers(
    goalkeepers: readonly { goalkeeperId: string; zoneIds: readonly string[] }[],
    now: Date,
  ): Promise<Map<string, GoalkeeperThreshold>> {
    const result = new Map<string, GoalkeeperThreshold>();
    const zoneIds = [...new Set(goalkeepers.flatMap((goalkeeper) => goalkeeper.zoneIds))];
    if (goalkeepers.length === 0) return result;
    const places = await this.place(zoneIds);
    const marketIds = [...new Set([...places.values()].map((placed) => placed.zone.marketId))];
    const countryIds = [...new Set([...places.values()].flatMap((placed) => placed.countryId ?? []))];
    const [settings, rates] = await Promise.all([
      this.settings.findFor({ zoneIds: [...places.keys()], marketIds, countryIds, goalkeeperIds: goalkeepers.map((goalkeeper) => goalkeeper.goalkeeperId) }),
      this.rentalRates?.findForZones([...places.keys()], marketIds) ?? Promise.resolve([] as RentalRate[]),
    ]);
    for (const goalkeeper of goalkeepers) {
      const viewer = { goalkeeperId: goalkeeper.goalkeeperId, now };
      const lowest = new Map<string, number | null>();
      for (const zoneId of goalkeeper.zoneIds) {
        const placed = places.get(zoneId);
        lowest.set(zoneId, placed ? this.lowestIn(placed, settings, rates, viewer) : null);
      }
      // Their own rules, active now in the country of their zones (one market, one country).
      const countries = new Set(goalkeeper.zoneIds.flatMap((zoneId) => places.get(zoneId)?.countryId ?? []));
      const ownRules = settings.filter(
        (setting) => setting.scope === 'goalkeeper' && setting.refId === goalkeeper.goalkeeperId && [...countries].some((countryId) => setting.isActiveAt(now, countryId)),
      );
      result.set(goalkeeper.goalkeeperId, { lowest, ownRules });
    }
    return result;
  }

  /** The lowest net over every tier: the tier's rule on the tier's lowest rate (zone rates, else market rates). */
  private lowestIn(placed: PlacedZone, settings: CommissionSetting[], rates: RentalRate[], viewer: CommissionViewer): number | null {
    const levels = this.levelsOf(placed, settings, viewer);
    const zoneRates = rates.filter((rate) => rate.scope === 'zone' && rate.refId === placed.zone.id);
    const marketRates = rates.filter((rate) => rate.scope === 'market' && rate.refId === placed.zone.marketId);
    const nets: number[] = [];
    for (const tier of ALL_MATCH_TIERS) {
      const rule = resolveTiered(levels, tier);
      if (!rule) continue;
      // A fixed rule costs the same whatever the match; a percentage needs the tier's lowest rate.
      if (rule.percentBps === 0) {
        nets.push(rule.fixedAmount);
        continue;
      }
      const rate = resolveTiered([zoneRates, marketRates], tier);
      if (!rate) continue;
      const lowestRate = Math.min(...[...zoneRates, ...marketRates].filter((item) => item.scope === rate.scope && item.modality === rate.modality).map((item) => item.amount));
      const net = commissionFor(rule, lowestRate, tier)?.net;
      if (net !== undefined) nets.push(net);
    }
    return nets.length === 0 ? null : Math.min(...nets);
  }

  /** The documents of each level, most specific first; a goalkeeper's rule only while active here (FR-010/FR-010a). */
  private levelsOf(placed: PlacedZone, settings: CommissionSetting[], viewer?: CommissionViewer): CommissionSetting[][] {
    const at = (scope: string, refId: string | null) => (refId === null ? [] : settings.filter((setting) => setting.scope === scope && setting.refId === refId));
    const goalkeeper =
      viewer && placed.countryId
        ? at('goalkeeper', viewer.goalkeeperId).filter((setting) => setting.isActiveAt(viewer.now, placed.countryId!))
        : [];
    return [goalkeeper, at('zone', placed.zone.id), at('market', placed.zone.marketId), at('country', placed.countryId)];
  }

  private async place(zoneIds: readonly string[]): Promise<Map<string, PlacedZone>> {
    const result = new Map<string, PlacedZone>();
    if (zoneIds.length === 0) return result;
    const zones = await this.zoneRepository.getManyByIds([...zoneIds]);
    const markets = await this.marketRepository.getByIds([...new Set(zones.map((zone) => zone.marketId))]);
    const countryOfMarket = new Map<string, string | null>(markets.map((market) => [market.id, market.countryId]));
    for (const zone of zones) result.set(zone.id, { zone, countryId: countryOfMarket.get(zone.marketId) ?? null });
    return result;
  }
}
