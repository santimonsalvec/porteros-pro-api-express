import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IRentalRateAdmin } from '../../common/ports.js';
import { rentalRateView } from '../../common/views.js';
import { GetRentalRateQuery, type GetRentalRateResult } from './getRentalRateQuery.js';

export class GetRentalRateQueryHandler implements IQueryHandler<GetRentalRateQuery, GetRentalRateResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { rentalRates: IRentalRateAdmin }) {}

  async handle({ rateId }: GetRentalRateQuery): Promise<GetRentalRateResult> {
    const record = await this.deps.rentalRates.getById(rateId);
    if (!record) return { outcome: 'not_found' };
    const geography = await PricingGeography.load(this.deps);
    return { outcome: 'ok', rate: rentalRateView(record, geography.target(record.scope, record.refId)) };
  }
}
