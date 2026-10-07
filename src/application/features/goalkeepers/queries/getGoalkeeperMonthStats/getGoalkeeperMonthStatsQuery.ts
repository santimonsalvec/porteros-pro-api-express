import { IQuery } from '../../../../common/mediator/types.js';
import type { CalendarMonth } from '../../../goalkeeperRequests/common/monthRange.js';

/** The goalkeeper's numbers for the current month (feature 026, `GET /goalkeepers/me/stats`). */
export interface GoalkeeperMonthStats {
  month: CalendarMonth;
  currency: string;
  /** What the clients paid for the matches played this month, gross. */
  earned: number;
  playedCount: number;
  /** `earned / playedCount`, rounded; `null` with no match played. */
  averagePerMatch: number | null;
  /** Bookings accepted and not played or ended yet, whatever their date. */
  toPlay: number;
  previous: {
    month: CalendarMonth;
    /** The previous month is counted from day 1 through this day, whole days. */
    throughDay: number;
    earned: number;
  };
  /** Change against `previous.earned`, rounded; `null` when there is nothing to compare with. */
  changePercent: number | null;
}

export type GetGoalkeeperMonthStatsResult =
  | { outcome: 'success'; stats: GoalkeeperMonthStats }
  | { outcome: 'not_a_goalkeeper' }
  /** The currency of the goalkeeper's country can't be resolved (as for the wallet). */
  | { outcome: 'wallet_not_configured'; cityId: string }
  /** The goalkeeper's city has no valid time zone, so its months can't be cut. */
  | { outcome: 'time_zone_not_configured'; cityId: string };

export class GetGoalkeeperMonthStatsQuery extends IQuery<GetGoalkeeperMonthStatsResult> {
  constructor(public readonly goalkeeperId: string) {
    super();
  }
}
