import { IQuery } from '../../../../common/mediator/types.js';
import type { RequestStatus } from '../../../../../domain/bookings/requestStatus.js';
import type { Page } from '../../../geography/common/views.js';
import type { RequestListItem } from '../../common/adminViews.js';

export interface ListRequestsAdminCriteria {
  status?: RequestStatus;
  countryId?: string;
  marketId?: string;
  /** Spec 031: the markets a member who holds only some may see. */
  marketIds?: readonly string[];
  zoneId?: string;
  /** Match start, `from` included, `to` excluded. */
  from?: Date;
  to?: Date;
  clientId?: string;
  goalkeeperId?: string;
  page: number;
  pageSize: number;
}

export type ListRequestsAdminResult = { outcome: 'ok'; page: Page<RequestListItem> } | { outcome: 'search_too_broad' };

/** The admin's request list (contracts/operations-api.md §1). */
export class ListRequestsAdminQuery extends IQuery<ListRequestsAdminResult> {
  constructor(readonly criteria: ListRequestsAdminCriteria) {
    super();
  }
}
