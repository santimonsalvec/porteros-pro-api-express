import { IQuery } from '../../../../common/mediator/types.js';
import type { AvailableListItem } from '../../common/goalkeeperBookingResponse.js';

export type ListAvailableBookingsResult =
  | {
      outcome: 'success';
      items: AvailableListItem[];
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      /** Why the list is empty whatever the matches (FR-002); null when the goalkeeper can see offers. */
      unavailableReason: 'not_available_for_offers' | 'insufficient_funds' | 'suspended' | null;
      missingAmount: number | null;
      suspendedUntil: string | null;
    }
  | { outcome: 'not_a_goalkeeper' };

/** The bookings the goalkeeper can take right now, soonest first, one page at a time. */
export class ListAvailableBookingsQuery extends IQuery<ListAvailableBookingsResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
