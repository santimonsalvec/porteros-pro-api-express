import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ZoneSummary } from '../../../geography/common/ports.js';
import { zonesLeftWithout } from '../../common/deleteImpact.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { CommissionRecord, ICommissionAdmin } from '../../common/ports.js';
import type { GoalkeeperTargetDependencies } from '../../common/goalkeeperTarget.js';
import { generalRuleFor, generalRulesOf } from '../../common/goalkeeperGeneralRules.js';
import type { DeleteImpactResult } from '../getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQuery } from './getCommissionDeleteImpactQuery.js';

export class GetCommissionDeleteImpactQueryHandler implements IQueryHandler<GetCommissionDeleteImpactQuery, DeleteImpactResult> {
  constructor(private readonly deps: PricingGeographyDependencies & Pick<GoalkeeperTargetDependencies, 'goalkeeperProfiles'> & { commissions: ICommissionAdmin }) {}

  async handle({ commissionId }: GetCommissionDeleteImpactQuery): Promise<DeleteImpactResult> {
    const removed = await this.deps.commissions.getById(commissionId);
    if (!removed) return { outcome: 'not_found' };
    const geography = await PricingGeography.load(this.deps);
    // A goalkeeper rule leaves no zone bare: the general rule of their market or country takes over (feature 033).
    if (removed.scope === 'goalkeeper') {
      const profile = await this.deps.goalkeeperProfiles.getByUserId(removed.refId);
      if (!profile) return { outcome: 'ok', impact: { zoneCount: 0, zoneNames: [], fallback: null } };
      const countryId = geography.countryOf(profile.marketId)?.id ?? null;
      const general = await generalRulesOf(this.deps.commissions, profile.marketId, countryId);
      return { outcome: 'ok', impact: { zoneCount: 0, zoneNames: [], fallback: generalRuleFor(general, profile.marketId, countryId, { modality: removed.modality ?? 'any' }, geography) } };
    }
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
      case 'goalkeeper':
        return [];
    }
  }
}
