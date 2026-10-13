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

const some = (field: keyof BookingCounts) => ({ [field]: { $gt: 0 } });
const none = (field: keyof BookingCounts) => ({ [field]: { $eq: 0 } });

/**
 * The `$match` on booking counts that selects the requests whose `requestStatusFromCounts` is
 * `status`. Only `$and`, `$gt: 0` and `$eq: 0`, so a test can evaluate it for every combination.
 */
export function statusMatch(status: RequestStatus): Document {
  const conditions: Record<RequestStatus, Document[]> = {
    searching: [some('pending'), none('assigned')],
    partially_assigned: [some('pending'), some('assigned')],
    assigned: [none('pending'), some('assigned')],
    completed: [none('pending'), none('assigned'), some('completed')],
    cancelled: [none('pending'), none('assigned'), none('completed'), some('cancelled')],
    expired: [none('pending'), none('assigned'), none('completed'), none('cancelled'), some('expired')],
    closed: [none('pending'), none('assigned'), none('completed'), none('cancelled'), none('expired')],
  };
  return { $and: conditions[status] };
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

  pipeline.push(
    { $lookup: { from: BOOKINGS_COLLECTION, localField: '_id', foreignField: 'requestId', as: 'bookings', pipeline: [{ $project: { _id: 0, status: 1 } }] } },
    {
      $addFields: Object.fromEntries(
        Object.entries(COUNTED).map(([field, status]) => [field, { $size: { $filter: { input: '$bookings', cond: { $eq: ['$$this.status', status] } } } }]),
      ),
    },
  );
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
