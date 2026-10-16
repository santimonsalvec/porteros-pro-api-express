import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { effectiveDiscount, effectivePriority, MAX_UNVERIFIED_DISCOUNT_BPS, MAX_VERIFIED_PRIORITY_MINUTES, type UnverifiedDiscountSetting, type UnverifiedLevels } from '../../../../../domain/pricing/unverifiedDiscount.js';
import type { IUnverifiedDiscountRepository } from '../../common/ports.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import { ListUnverifiedDiscountsQuery, type DiscountSettingView, type EffectiveTerms, type ListUnverifiedDiscountsResult } from './listUnverifiedDiscountsQuery.js';

const view = (setting: UnverifiedDiscountSetting | undefined): DiscountSettingView | null =>
  setting ? { id: setting.id, discountBps: setting.discountBps, verifiedPriorityMinutes: setting.verifiedPriorityMinutes, revision: setting.revision } : null;

function terms(levels: UnverifiedLevels): EffectiveTerms {
  const discount = effectiveDiscount(levels);
  const priority = effectivePriority(levels);
  return { discountBps: discount.discountBps, discountOrigin: discount.origin, verifiedPriorityMinutes: priority.verifiedPriorityMinutes, priorityOrigin: priority.origin };
}

export class ListUnverifiedDiscountsQueryHandler implements IQueryHandler<ListUnverifiedDiscountsQuery, ListUnverifiedDiscountsResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { discounts: IUnverifiedDiscountRepository }) {}

  async handle({ countryId }: ListUnverifiedDiscountsQuery): Promise<ListUnverifiedDiscountsResult> {
    const geography = await PricingGeography.load(this.deps);
    const country = (await this.deps.countries.getById(countryId)) ?? null;
    if (!country) return { outcome: 'not_found' };
    const markets = geography.marketsOf(countryId).filter((market) => geography.zones(market.id).length > 0);
    const zones = markets.flatMap((market) => geography.zones(market.id));
    const settings = await this.deps.discounts.findFor({ zoneIds: zones.map((zone) => zone.id), marketIds: markets.map((market) => market.id), countryIds: [countryId] });
    const at = (scope: string, refId: string) => settings.find((setting) => setting.scope === scope && setting.refId === refId);
    const countrySetting = at('country', countryId);
    return {
      outcome: 'ok',
      view: {
        maxBps: MAX_UNVERIFIED_DISCOUNT_BPS,
        maxPriorityMinutes: MAX_VERIFIED_PRIORITY_MINUTES,
        country: { id: country.id, name: country.name, setting: view(countrySetting), effective: terms([undefined, undefined, countrySetting]) },
        markets: markets.map((market) => ({
          id: market.id,
          name: market.name,
          setting: view(at('market', market.id)),
          effective: terms([undefined, at('market', market.id), countrySetting]),
        })),
        zones: zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          marketId: zone.marketId,
          active: zone.active,
          setting: view(at('zone', zone.id)),
          effective: terms([at('zone', zone.id), at('market', zone.marketId), countrySetting]),
        })),
      },
    };
  }
}
