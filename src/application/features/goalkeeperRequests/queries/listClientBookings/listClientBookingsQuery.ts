import { IQuery } from '../../../../common/mediator/types.js';
import type { ListedBookingResponse } from '../../common/bookingResponse.js';

export interface ListClientBookingsResult {
  items: ListedBookingResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** The caller's bookings, upcoming then past, one page at a time. */
export class ListClientBookingsQuery extends IQuery<ListClientBookingsResult> {
  constructor(
    public readonly clientId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
