import { IQuery } from '../../../../common/mediator/types.js';
import type { PricedModality } from '../../../../../domain/bookings/matchFormat.js';
import type { Page } from '../../../geography/common/views.js';
import type { CommissionView } from '../../common/views.js';

export interface CommissionFilters {
  countryId?: string;
  /** An anchor market: its own commissions and its zones'. */
  marketId?: string;
  zoneId?: string;
  scope?: 'country' | 'market' | 'zone' | 'goalkeeper';
  modality?: PricedModality | 'general';
}

/** The commissions with their VAT: country first, then markets, then zones by display order (contracts/pricing-api.md). */
export class ListCommissionsQuery extends IQuery<Page<CommissionView>> {
  constructor(
    readonly filters: CommissionFilters,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
