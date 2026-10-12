import type { Document } from 'mongodb';
import type { UserListFilter } from '../../../application/features/users/common/ports.js';
import { userSearchMatch } from '../../../application/features/users/common/userSearch.js';

/** What a user row reads: never the phone number. */
const ROW_PROJECTION = {
  email: 1,
  firstName: 1,
  lastName: 1,
  displayName: 1,
  countryCallingCode: 1,
  created: 1,
  isProfileComplete: 1,
  isGoalkeeper: 1,
  blocked: 1,
};

/**
 * The admin's user list (admin spec 005, research §4): the search and the user's own filters
 * first, then whether each one is a goalkeeper or blocked (two lookups by unique key), newest
 * first, one page and the total. Old documents keep `createdAt` under `DateTime`, so it is
 * normalised into `created` before filtering and sorting.
 */
export function usersListPipeline(filter: UserListFilter): Document[] {
  const pipeline: Document[] = [];
  const search = filter.q ? userSearchMatch(filter.q) : null;
  if (search) pipeline.push({ $match: search });
  pipeline.push({ $addFields: { created: { $toDate: { $ifNull: ['$createdAt.DateTime', '$createdAt'] } } } });

  const own: Document = {};
  if (filter.countryCallingCode !== undefined) own.countryCallingCode = filter.countryCallingCode;
  if (filter.createdFrom || filter.createdTo) {
    own.created = { ...(filter.createdFrom ? { $gte: filter.createdFrom } : {}), ...(filter.createdTo ? { $lt: filter.createdTo } : {}) };
  }
  if (Object.keys(own).length > 0) pipeline.push({ $match: own });

  pipeline.push(
    { $lookup: { from: 'goalkeeperProfiles', localField: '_id', foreignField: 'userId', as: 'goalkeeperProfile', pipeline: [{ $project: { _id: 1 } }] } },
    { $lookup: { from: 'userBlocks', localField: '_id', foreignField: '_id', as: 'block', pipeline: [{ $project: { blocked: 1 } }] } },
    {
      $addFields: {
        isGoalkeeper: { $gt: [{ $size: '$goalkeeperProfile' }, 0] },
        blocked: { $eq: [{ $first: '$block.blocked' }, true] },
      },
    },
  );

  const joined: Document = {};
  if (filter.role !== undefined) joined.isGoalkeeper = filter.role === 'goalkeeper';
  if (filter.blocked !== undefined) joined.blocked = filter.blocked;
  if (Object.keys(joined).length > 0) pipeline.push({ $match: joined });

  pipeline.push(
    { $sort: { created: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: (filter.page - 1) * filter.pageSize }, { $limit: filter.pageSize }, { $project: ROW_PROJECTION }],
        total: [{ $count: 'count' }],
      },
    },
  );
  return pipeline;
}
