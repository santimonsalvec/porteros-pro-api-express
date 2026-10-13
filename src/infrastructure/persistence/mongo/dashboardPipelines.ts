import type { Document } from 'mongodb';
import { emptyStatusCounts, statusCountsFrom } from '../../../application/features/dashboard/common/areas.js';
import type { GoalkeepersArea, RequestsArea, WalletsArea } from '../../../application/features/dashboard/common/ports.js';
import type { DashboardWindows } from '../../../application/features/dashboard/common/windows.js';
import { BOOKING_STATUSES } from '../../../domain/bookings/booking.js';
import type { RequestStatus } from '../../../domain/bookings/requestStatus.js';
import { bookingCountStages, requestStatusExpression } from './requestAdminPipelines.js';

export const REQUEST_STATUSES: readonly RequestStatus[] = ['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed'];

type Row = { _id: unknown; count: number };
const byStatus = (rows: readonly Row[] | undefined) => (rows ?? []).map((row) => ({ status: String(row._id), count: row.count }));

const countBy = (field: string) => ({ $group: { _id: field, count: { $sum: 1 } } });
const TODAY_ONLY = { $match: { today: true } };
const EACH_BOOKING = { $unwind: '$bookingStatuses' };

/**
 * The week's matches, read once (admin spec 008, research §3): requests by their match date
 * (`startsAt`, indexes `startsAt_id` and `city_startsAt`) and city, as the request list filters
 * them, each with its status (the list's rule) and its bookings' statuses. Bookings are counted
 * through their request because they do not store a city. Today is inside the week.
 */
export function matchesPipeline(windows: Pick<DashboardWindows, 'today' | 'week'>, cityIds: readonly string[] | null, timeZone: string): Document[] {
  const match: Document = { startsAt: { $gte: windows.week.from, $lt: windows.week.to } };
  if (cityIds !== null) match['match.cityId'] = { $in: [...cityIds] };
  return [
    { $match: match },
    ...bookingCountStages(),
    {
      $project: {
        _id: 0,
        status: requestStatusExpression(),
        day: { $dateToString: { date: '$startsAt', format: '%Y-%m-%d', timezone: timeZone } },
        today: { $and: [{ $gte: ['$startsAt', windows.today.from] }, { $lt: ['$startsAt', windows.today.to] }] },
        bookingStatuses: '$bookings.status',
      },
    },
    {
      $facet: {
        requestsToday: [TODAY_ONLY, countBy('$status')],
        requestsWeek: [countBy('$status')],
        bookingsToday: [TODAY_ONLY, EACH_BOOKING, countBy('$bookingStatuses')],
        bookingsWeek: [EACH_BOOKING, countBy('$bookingStatuses')],
        bookingsByDay: [EACH_BOOKING, { $group: { _id: { day: '$day', status: '$bookingStatuses' }, count: { $sum: 1 } } }],
      },
    },
  ];
}

export interface MatchesFacet {
  requestsToday: Row[];
  requestsWeek: Row[];
  bookingsToday: Row[];
  bookingsWeek: Row[];
  bookingsByDay: { _id: { day: string; status: string }; count: number }[];
}

/** The facet as the area: every status present, the week's seven days in order. */
export function toRequestsArea(facet: MatchesFacet | undefined, days: readonly string[]): RequestsArea {
  return {
    requests: {
      today: statusCountsFrom(REQUEST_STATUSES, byStatus(facet?.requestsToday)),
      week: statusCountsFrom(REQUEST_STATUSES, byStatus(facet?.requestsWeek)),
    },
    bookings: {
      today: statusCountsFrom(BOOKING_STATUSES, byStatus(facet?.bookingsToday)),
      week: statusCountsFrom(BOOKING_STATUSES, byStatus(facet?.bookingsWeek)),
      weekByDay: days.map((date) => {
        const rows = (facet?.bookingsByDay ?? []).filter((row) => row._id.day === date).map((row) => ({ status: row._id.status, count: row.count }));
        return { date, counts: rows.length > 0 ? statusCountsFrom(BOOKING_STATUSES, rows) : emptyStatusCounts(BOOKING_STATUSES) };
      }),
    },
  };
}

/**
 * The scope's active goalkeepers (research §4, Clarifications): every profile is an active
 * goalkeeper; suspended and blocked may count the same one; available needs offers on (absent =
 * on, as the offers read it), no current suspension and no block.
 */
export function goalkeepersSummaryPipeline(cityIds: readonly string[] | null, now: Date): Document[] {
  return [
    ...(cityIds !== null ? [{ $match: { cityId: { $in: [...cityIds] } } }] : []),
    { $lookup: { from: 'userBlocks', localField: 'userId', foreignField: '_id', as: 'block', pipeline: [{ $match: { blocked: true } }, { $project: { _id: 1 } }] } },
    {
      $addFields: {
        suspended: { $gt: [{ $ifNull: ['$suspendedUntil', null] }, now] },
        blocked: { $gt: [{ $size: '$block' }, 0] },
        offersOn: { $ne: ['$availableForOffers', false] },
      },
    },
    {
      $group: {
        _id: null,
        active: { $sum: 1 },
        suspended: { $sum: { $cond: ['$suspended', 1, 0] } },
        blocked: { $sum: { $cond: ['$blocked', 1, 0] } },
        available: { $sum: { $cond: [{ $and: ['$offersOn', { $not: ['$suspended'] }, { $not: ['$blocked'] }] }, 1, 0] } },
      },
    },
  ];
}

export function toGoalkeepersArea(group: (Partial<GoalkeepersArea> & { _id?: null }) | undefined): GoalkeepersArea {
  return { active: group?.active ?? 0, available: group?.available ?? 0, suspended: group?.suspended ?? 0, blocked: group?.blocked ?? 0 };
}

/**
 * The wallets' money per currency (research §5, FR-006): positive balances and debts apart, never
 * two currencies together; the scope's goalkeepers (a wallet's id is its goalkeeper's) or all.
 */
export function walletsByCurrencyPipeline(goalkeeperIds: readonly string[] | null): Document[] {
  return [
    ...(goalkeeperIds !== null ? [{ $match: { _id: { $in: [...goalkeeperIds] } } }] : []),
    {
      $group: {
        _id: '$currency',
        balanceTotal: { $sum: { $max: ['$balance', 0] } },
        debtTotal: { $sum: { $min: ['$balance', 0] } },
        negativeCount: { $sum: { $cond: [{ $lt: ['$balance', 0] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

export function toWalletsArea(groups: readonly { _id: string; balanceTotal: number; debtTotal: number; negativeCount: number }[]): WalletsArea {
  return { byCurrency: groups.map(({ _id, balanceTotal, debtTotal, negativeCount }) => ({ currency: _id, balanceTotal, debtTotal, negativeCount })) };
}
