import type { Document } from 'mongodb';
import type { RequestListFilter } from '../../../application/features/goalkeeperRequests/common/adminPorts.js';
import type { BookingCounts, RequestStatus } from '../../../domain/bookings/requestStatus.js';
import { BOOKINGS_COLLECTION } from './bookingRepository.js';

/** The booking statuses counted for a request's status (`requestStatusFromCounts`). */
const COUNTED: Record<keyof BookingCounts, string> = {
  pending: 'pending_assignment',
  assigned: 'assigned',
  completed: 'completed',
  cancelled: 'cancelled',
  expired: 'expired',
};

/** A count that must be above zero (`present`) or zero for a status. */
export interface CountCondition {
  field: keyof BookingCounts;
  present: boolean;
}

/**
 * `requestStatusFromCounts` as data (admin specs 006 and 008): for each status, the booking counts
 * that must be present or absent. The conditions are mutually exclusive, so the list's `$match`
 * and the dashboard's `$switch` read them in any order and always agree.
 */
export function requestStatusBranches(): { status: RequestStatus; conditions: CountCondition[] }[] {
  const some = (field: keyof BookingCounts): CountCondition => ({ field, present: true });
  const none = (field: keyof BookingCounts): CountCondition => ({ field, present: false });
  return [
    { status: 'searching', conditions: [some('pending'), none('assigned')] },
    { status: 'partially_assigned', conditions: [some('pending'), some('assigned')] },
    { status: 'assigned', conditions: [none('pending'), some('assigned')] },
    { status: 'completed', conditions: [none('pending'), none('assigned'), some('completed')] },
    { status: 'cancelled', conditions: [none('pending'), none('assigned'), none('completed'), some('cancelled')] },
    { status: 'expired', conditions: [none('pending'), none('assigned'), none('completed'), none('cancelled'), some('expired')] },
    { status: 'closed', conditions: [none('pending'), none('assigned'), none('completed'), none('cancelled'), none('expired')] },
  ];
}

/**
 * The `$match` on booking counts that selects the requests whose `requestStatusFromCounts` is
 * `status`. Only `$and`, `$gt: 0` and `$eq: 0`, so a test can evaluate it for every combination.
 */
export function statusMatch(status: RequestStatus): Document {
  const branch = requestStatusBranches().find((each) => each.status === status)!;
  return { $and: branch.conditions.map(({ field, present }) => ({ [field]: present ? { $gt: 0 } : { $eq: 0 } })) };
}

/** The same rule as an aggregation expression over the count fields (admin spec 008, research §3). */
export function requestStatusExpression(): Document {
  return {
    $switch: {
      branches: requestStatusBranches().map(({ status, conditions }) => ({
        case: { $and: conditions.map(({ field, present }) => (present ? { $gt: [`$${field}`, 0] } : { $eq: [`$${field}`, 0] })) },
        then: status,
      })),
      default: 'closed',
    },
  };
}

/**
 * Each request's bookings (index `requestId`) counted by the statuses that decide its own, as
 * `bookings` (their statuses) and one field per count (admin specs 006 and 008).
 */
export function bookingCountStages(): Document[] {
  return [
    { $lookup: { from: BOOKINGS_COLLECTION, localField: '_id', foreignField: 'requestId', as: 'bookings', pipeline: [{ $project: { _id: 0, status: 1 } }] } },
    {
      $addFields: Object.fromEntries(
        Object.entries(COUNTED).map(([field, status]) => [field, { $size: { $filter: { input: '$bookings', cond: { $eq: ['$$this.status', status] } } } }]),
      ),
    },
  ];
}

/** What a list row reads: the request's own fields and its booking counts. */
const ROW_PROJECTION = {
  clientId: 1,
  startsAt: 1,
  zoneId: 1,
  'match.cityId': 1,
  'match.timeZone': 1,
  'match.goalkeeperCount': 1,
  'pricing.total': 1,
  'pricing.currency': 1,
  createdAt: 1,
  pending: 1,
  assigned: 1,
  completed: 1,
  cancelled: 1,
  expired: 1,
};

/**
 * The admin's request list (admin spec 006, research §6): the request's own filters first (served
 * by `startsAt_id`, `city_startsAt` and `client_startsAt`), then its bookings counted by status
 * (index `requestId`), the status filter on those counts, newest match first, one page and the total.
 */
export function requestsListPipeline(filter: RequestListFilter): Document[] {
  const pipeline: Document[] = [];
  const own: Document = {};
  if (filter.from || filter.to) {
    own.startsAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lt: filter.to } : {}) };
  }
  if (filter.zoneId !== undefined) own.zoneId = filter.zoneId;
  if (filter.cityIds !== undefined) own['match.cityId'] = { $in: [...filter.cityIds] };
  if (filter.clientId !== undefined) own.clientId = filter.clientId;
  if (filter.requestIds !== undefined) own._id = { $in: [...filter.requestIds] };
  if (Object.keys(own).length > 0) pipeline.push({ $match: own });

  pipeline.push(...bookingCountStages());
  if (filter.status !== undefined) pipeline.push({ $match: statusMatch(filter.status) });

  pipeline.push(
    { $sort: { startsAt: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: (filter.page - 1) * filter.pageSize }, { $limit: filter.pageSize }, { $project: ROW_PROJECTION }],
        total: [{ $count: 'count' }],
      },
    },
  );
  return pipeline;
}
