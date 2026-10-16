import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { zonesLeftWithout } from '../../common/deleteImpact.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IRentalRateAdmin } from '../../common/ports.js';
import { GetRentalRateDeleteImpactQuery, type DeleteImpactResult } from './getRentalRateDeleteImpactQuery.js';

export class GetRentalRateDeleteImpactQueryHandler implements IQueryHandler<GetRentalRateDeleteImpactQuery, DeleteImpactResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { rentalRates: IRentalRateAdmin }) {}

  async handle({ rateId }: GetRentalRateDeleteImpactQuery): Promise<DeleteImpactResult> {
    const removed = await this.deps.rentalRates.getById(rateId);
    if (!removed) return { outcome: 'not_found' };
    const geography = await PricingGeography.load(this.deps);
    const marketId = removed.scope === 'market' ? removed.refId : (geography.zone(removed.refId)?.marketId ?? null);
    if (marketId === null) return { outcome: 'ok', impact: { zoneCount: 0, zoneNames: [] } };

    const zones = geography.zones(marketId);
    const rates = await this.deps.rentalRates.find({
      refs: [
        { scope: 'market', refIds: [marketId] },
        { scope: 'zone', refIds: zones.map((zone) => zone.id) },
      ],
      durationMinutes: removed.durationMinutes,
    });
    const impact = zonesLeftWithout(rateId, zones, (zone) =>
      rates.filter((rate) => (rate.scope === 'zone' ? rate.refId === zone.id : rate.refId === marketId)),
    );
    return { outcome: 'ok', impact };
  }
}
