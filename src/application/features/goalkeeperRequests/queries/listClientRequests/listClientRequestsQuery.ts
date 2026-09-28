import { IQuery } from '../../../../common/mediator/types.js';
import type { ListedRequestResponse } from '../../common/requestResponse.js';

export interface ListClientRequestsResult {
  items: ListedRequestResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** The caller's requests (one per match, each with its bookings), upcoming then past, one page at a time. */
export class ListClientRequestsQuery extends IQuery<ListClientRequestsResult> {
  constructor(
    public readonly clientId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
