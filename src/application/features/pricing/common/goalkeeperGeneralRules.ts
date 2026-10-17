import { ALL_MATCH_TIERS, resolveTiered, type MatchTier } from '../../../../domain/pricing/tieredRate.js';
import { kindOf } from '../../../../domain/operatingBalance/commissionRule.js';
import type { CommissionRecord, ICommissionAdmin } from './ports.js';
import type { FallbackRule } from './deleteImpact.js';
import type { PricingGeography } from './pricingGeography.js';

/** The market's and the country's rules, read once (feature 033). */
export async function generalRulesOf(commissions: ICommissionAdmin, marketId: string, countryId: string | null): Promise<CommissionRecord[]> {
  return commissions.find({
    refs: [
      { scope: 'market', refIds: [marketId] },
      { scope: 'country', refIds: countryId ? [countryId] : [] },
    ],
  });
}

/** The general rule that applies to one tier at market → country level (zones may still override it). */
export function generalRuleFor(records: readonly CommissionRecord[], marketId: string, countryId: string | null, match: MatchTier, geography: PricingGeography): FallbackRule | null {
  const valid = records.filter((record) => !record.invalid);
  const levels = [valid.filter((record) => record.scope === 'market' && record.refId === marketId), valid.filter((record) => record.scope === 'country' && record.refId === countryId)];
  const rule = resolveTiered(levels, match);
  if (!rule) return null;
  const name = rule.scope === 'market' ? (geography.market(rule.refId)?.name ?? null) : (geography.countryOf(marketId)?.name ?? null);
  return { fixedAmount: rule.fixedAmount, percentBps: rule.percentBps, kind: kindOf(rule), origin: { scope: rule.scope as 'market' | 'country', refId: rule.refId, name } };
}

export { ALL_MATCH_TIERS };
