import type { ITaxSettingsRepository } from '../../../operatingBalance/common/ports.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { CommissionRecord } from '../../common/ports.js';
import { vatRatesOf } from '../../common/vatRates.js';
import { commissionView, type CommissionView } from '../../common/views.js';

export interface CommissionViewDependencies extends PricingGeographyDependencies {
  taxSettings: ITaxSettingsRepository;
}

/** Commissions joined with their target and their country's VAT, in one pass. */
export async function commissionViews(
  deps: CommissionViewDependencies,
  records: readonly CommissionRecord[],
): Promise<{ views: CommissionView[]; geography: PricingGeography }> {
  const geography = await PricingGeography.load(deps);
  const targets = records.map((record) => geography.target(record.scope, record.refId));
  const vat = await vatRatesOf(deps.taxSettings, targets.map((target) => target.countryId));
  const views = records.map((record, index) => {
    const target = targets[index]!;
    return commissionView(record, target, target.countryId === null ? 0 : (vat.get(target.countryId) ?? 0));
  });
  return { views, geography };
}
