import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ZoneSummary } from '../../../geography/common/ports.js';
import { zonesLeftWithout } from '../../common/deleteImpact.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { CommissionRecord, ICommissionAdmin } from '../../common/ports.js';
import type { DeleteImpactResult } from '../getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQuery } from './getCommissionDeleteImpactQuery.js';

export class GetCommissionDeleteImpactQueryHandler implements IQueryHandler<GetCommissionDeleteImpactQuery, DeleteImpactResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { commissions: ICommissionAdmin }) {}

  async handle({ commissionId }: GetCommissionDeleteImpactQuery): Promise<DeleteImpactResult> {
    const removed = await this.deps.commissions.getById(commissionId);
    if (!removed) return { outcome: 'not_found' };
    const geography = await PricingGeography.load(this.deps);
    const zones = this.zonesCoveredBy(removed, geography);
    const marketIds = [...new Set(zones.map((zone) => zone.marketId))];
    const countryIds = [...new Set(marketIds.flatMap((marketId) => geography.countryOf(marketId)?.id ?? []))];
    const commissions = await this.deps.commissions.find({
      refs: [
        { scope: 'zone', refIds: zones.map((zone) => zone.id) },
        { scope: 'market', refIds: marketIds },
        { scope: 'country', refIds: countryIds },
      ],
    });
    const impact = zonesLeftWithout(commissionId, zones, (zone) =>
      commissions.filter(
        (item) =>
          (item.scope === 'zone' && item.refId === zone.id) ||
          (item.scope === 'market' && item.refId === zone.marketId) ||
          (item.scope === 'country' && item.refId === geography.countryOf(zone.marketId)?.id),
      ),
    );
    return { outcome: 'ok', impact };
  }

  /** The zones a commission applies to: its zone, its market's zones, or every zone of its country. */
  private zonesCoveredBy(removed: CommissionRecord, geography: PricingGeography): ZoneSummary[] {
    switch (removed.scope) {
      case 'zone':
        return [geography.zone(removed.refId) ?? []].flat();
      case 'market':
        return geography.zones(removed.refId);
      case 'country':
        return geography.marketsOf(removed.refId).flatMap((market) => geography.zones(market.id));
    }
  }
}
