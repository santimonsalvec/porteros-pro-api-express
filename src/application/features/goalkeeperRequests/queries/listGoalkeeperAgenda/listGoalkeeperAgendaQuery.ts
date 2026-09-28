import { IQuery } from '../../../../common/mediator/types.js';
import type { AgendaItem } from '../../common/goalkeeperBookingResponse.js';

export type ListGoalkeeperAgendaResult =
  | { outcome: 'success'; items: AgendaItem[]; page: number; pageSize: number; totalItems: number; totalPages: number }
  | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper's own bookings: upcoming (soonest first) then past (most recent first). */
export class ListGoalkeeperAgendaQuery extends IQuery<ListGoalkeeperAgendaResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
