import { effectiveDiscount, effectivePriority, VERIFIED_PRIORITY_MINUTES_DEFAULT } from '../../../../domain/pricing/unverifiedDiscount.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
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
 * its anchor market's, else its country's, else the default (no discount, 15 minutes). Any number
 * of zones with one settings read, as the commission resolver does.
 */
export class UnverifiedDiscountResolver {
  constructor(
    private readonly settings: IUnverifiedDiscountRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly marketRepository: Pick<IMarketRepository, 'getByIds'>,
  ) {}

  async forZone(zoneId: string): Promise<UnverifiedTerms> {
    return (await this.forZones([zoneId])).get(zoneId) ?? DEFAULT_TERMS;
  }

  async forZones(zoneIds: readonly string[]): Promise<Map<string, UnverifiedTerms>> {
    const result = new Map(zoneIds.map((zoneId) => [zoneId, DEFAULT_TERMS]));
    if (zoneIds.length === 0) return result;
    const zones = await this.zoneRepository.getManyByIds([...zoneIds]);
    const markets = await this.marketRepository.getByIds([...new Set(zones.map((zone) => zone.marketId))]);
    const countryOfMarket = new Map<string, string | null>(markets.map((market) => [market.id, market.countryId]));
    const settings = await this.settings.findFor({
      zoneIds: zones.map((zone) => zone.id),
      marketIds: markets.map((market) => market.id),
      countryIds: [...new Set([...countryOfMarket.values()].filter((id): id is string => id !== null))],
    });
    const at = (scope: string, refId: string | null) => (refId === null ? undefined : settings.find((setting) => setting.scope === scope && setting.refId === refId));
    for (const zone of zones) {
      const country = countryOfMarket.get(zone.marketId) ?? null;
      const levels = [at('zone', zone.id), at('market', zone.marketId), at('country', country)] as const;
      result.set(zone.id, { discountBps: effectiveDiscount(levels).discountBps, verifiedPriorityMinutes: effectivePriority(levels).verifiedPriorityMinutes });
    }
    return result;
  }
}
