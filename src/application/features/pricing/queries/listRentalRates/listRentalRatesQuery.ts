import { IQuery } from '../../../../common/mediator/types.js';
import type { PricedModality } from '../../../../../domain/bookings/matchFormat.js';
import type { Page } from '../../../geography/common/views.js';
import type { RentalRateView } from '../../common/views.js';

export interface RentalRateFilters {
  countryId?: string;
  /** An anchor market: its own rates and its zones'. */
  marketId?: string;
  zoneId?: string;
  durationMinutes?: number;
  modality?: PricedModality | 'general';
}

/** The rates, sorted by market, duration, level (market, then zones by display order) and tier (contracts/pricing-api.md). */
export class ListRentalRatesQuery extends IQuery<Page<RentalRateView>> {
  constructor(
    readonly filters: RentalRateFilters,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
