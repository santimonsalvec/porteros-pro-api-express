import type { Document } from 'mongodb';
import type { GoalkeeperListFilter } from '../../../application/features/goalkeepers/common/adminPorts.js';
import { OPERATING_BALANCES_COLLECTION } from './operatingBalanceRepository.js';

/** What a goalkeeper row reads from the profile and its operating balance. */
const ROW_PROJECTION = { userId: 1, cityId: 1, zoneCount: { $size: { $ifNull: ['$zoneIds', []] } }, availableForOffers: 1, suspendedUntil: 1, balance: 1, currency: 1, activatedAt: 1 };

/**
 * The admin's goalkeeper list (admin spec 005, research §5): the profile's own filters first (its
 * indexes), then the operating balance (`_id` = the goalkeeper's user id; none = balance 0) and its filter,
 * newest activations first, one page and the total.
 */
export function goalkeepersListPipeline(filter: GoalkeeperListFilter): Document[] {
  const own: Document = {};
  if (filter.userIds !== undefined) own.userId = { $in: [...filter.userIds] };
  if (filter.cityId !== undefined) own.cityId = filter.cityId;
  if (filter.zoneId !== undefined) own.zoneIds = filter.zoneId;
  if (filter.suspended === true) own.suspendedUntil = { $gt: filter.now };
  if (filter.suspended === false) own.$or = [{ suspendedUntil: null }, { suspendedUntil: { $lte: filter.now } }];
  // `$ne: false` also matches profiles activated before the switch existed, as the offers do.
  if (filter.availableForOffers !== undefined) own.availableForOffers = filter.availableForOffers ? { $ne: false } : false;

  const pipeline: Document[] = Object.keys(own).length > 0 ? [{ $match: own }] : [];
  pipeline.push(
    { $lookup: { from: OPERATING_BALANCES_COLLECTION, localField: 'userId', foreignField: '_id', as: 'operatingBalance', pipeline: [{ $project: { balance: 1, currency: 1 } }] } },
    { $addFields: { balance: { $ifNull: [{ $first: '$operatingBalance.balance' }, 0] }, currency: { $first: '$operatingBalance.currency' } } },
  );
  if (filter.balanceBelow !== undefined) pipeline.push({ $match: { balance: { $lt: filter.balanceBelow } } });
  pipeline.push(
    { $sort: { activatedAt: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: (filter.page - 1) * filter.pageSize }, { $limit: filter.pageSize }, { $project: ROW_PROJECTION }],
        total: [{ $count: 'count' }],
      },
    },
  );
  return pipeline;
}

/** The clients' ratings of each of these goalkeepers: stars averaged, and how many (research §6). */
export function ratingsPipeline(userIds: readonly string[]): Document[] {
  return [
    { $match: { subjectId: { $in: [...userIds] }, side: 'client' } },
    { $group: { _id: '$subjectId', average: { $avg: '$stars' }, count: { $sum: 1 } } },
  ];
}
