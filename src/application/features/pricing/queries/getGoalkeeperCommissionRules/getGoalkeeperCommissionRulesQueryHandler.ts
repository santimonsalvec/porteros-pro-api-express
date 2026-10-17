import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { isValidTimeZone } from '../../../goalkeeperRequests/common/zonedTime.js';
import { ALL_MATCH_TIERS, generalRuleFor, generalRulesOf } from '../../common/goalkeeperGeneralRules.js';
import type { GoalkeeperTargetDependencies } from '../../common/goalkeeperTarget.js';
import type { ICommissionAdmin } from '../../common/ports.js';
import { commissionViews, type CommissionViewDependencies } from '../listCommissions/commissionViews.js';
import { GetGoalkeeperCommissionRulesQuery, type GetGoalkeeperCommissionRulesResult } from './getGoalkeeperCommissionRulesQuery.js';

export type GoalkeeperCommissionRulesDependencies = CommissionViewDependencies & Pick<GoalkeeperTargetDependencies, 'goalkeeperProfiles'> & { commissions: ICommissionAdmin };

export class GetGoalkeeperCommissionRulesQueryHandler implements IQueryHandler<GetGoalkeeperCommissionRulesQuery, GetGoalkeeperCommissionRulesResult> {
  constructor(private readonly deps: GoalkeeperCommissionRulesDependencies) {}

  async handle({ goalkeeperId }: GetGoalkeeperCommissionRulesQuery): Promise<GetGoalkeeperCommissionRulesResult> {
    const profile = await this.deps.goalkeeperProfiles.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_found' };
    const [own, [user]] = await Promise.all([
      this.deps.commissions.find({ refs: [{ scope: 'goalkeeper', refIds: [goalkeeperId] }] }),
      this.deps.users.getByIds([goalkeeperId]),
    ]);
    const { views, geography } = await commissionViews(this.deps, own);
    const market = geography.market(profile.marketId);
    if (!market) return { outcome: 'not_found' };
    const country = geography.countryOf(market.id);
    const general = await generalRulesOf(this.deps.commissions, market.id, country?.id ?? null);
    return {
      outcome: 'ok',
      rules: {
        goalkeeper: {
          userId: goalkeeperId,
          name: user?.displayName ?? ([user?.firstName, user?.lastName].filter(Boolean).join(' ') || null),
          marketId: market.id,
          marketName: market.name,
          countryId: country?.id ?? null,
          currency: country?.currency ?? null,
          timeZone: isValidTimeZone(market.timeZone) ? market.timeZone : 'UTC',
        },
        rules: views.sort((a, b) => (a.modality ?? '').localeCompare(b.modality ?? '')),
        general: ALL_MATCH_TIERS.map((tier) => ({ modality: tier.modality, rule: generalRuleFor(general, market.id, country?.id ?? null, tier, geography) })),
      },
    };
  }
}
