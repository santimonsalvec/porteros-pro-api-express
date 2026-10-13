import { IQuery } from '../../../../common/mediator/types.js';
import type { PricedModality } from '../../../../../domain/bookings/matchFormat.js';
import type { Page } from '../../../geography/common/views.js';
import type { CommissionView } from '../../common/views.js';

export interface CommissionFilters {
  countryId?: string;
  /** An anchor city: its own commissions and its zones'. */
  cityId?: string;
  zoneId?: string;
  scope?: 'country' | 'city' | 'zone';
  modality?: PricedModality | 'general';
}

/** The commissions with their VAT: country first, then cities, then zones by display order (contracts/pricing-api.md). */
export class ListCommissionsQuery extends IQuery<Page<CommissionView>> {
  constructor(
    readonly filters: CommissionFilters,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
