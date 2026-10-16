import type { Document } from 'mongodb';
import type { GoalkeeperListFilter } from '../../../application/features/goalkeepers/common/adminPorts.js';
import { OPERATING_BALANCES_COLLECTION } from './operatingBalanceRepository.js';
import { BACKGROUND_CHECKS_COLLECTION } from './backgroundCheckRepository.js';

/** What a goalkeeper row reads from the profile and its operating balance. */
const ROW_PROJECTION = {
  userId: 1,
  marketId: 1,
  zoneCount: { $size: { $ifNull: ['$zoneIds', []] } },
  availableForOffers: 1,
  suspendedUntil: 1,
  balance: 1,
  currency: 1,
  activatedAt: 1,
  // Admin spec 030.
  vettingValidation: '$vetting.validation',
  verificationMethod: '$vetting.verification.method',
  backgroundCheckAlert: 1,
};

const EXPIRING_SOON_MS = 30 * 86_400_000;

/**
 * Admin spec 030: each goalkeeper's background checks, as one alert — a check to review first, then
 * every approved one expired, then the valid ones all expiring within 30 days.
 */
function backgroundCheckAlertSteps(now: Date): Document[] {
  const soon = new Date(now.getTime() + EXPIRING_SOON_MS);
  return [
    {
      $lookup: {
        from: BACKGROUND_CHECKS_COLLECTION,
        localField: 'userId',
        foreignField: 'goalkeeperId',
        as: 'checks',
        pipeline: [{ $project: { status: 1, expiresAt: 1 } }],
      },
    },
    {
      $addFields: {
        backgroundCheckAlert: {
          $let: {
            vars: {
              pending: { $size: { $filter: { input: '$checks', cond: { $eq: ['$$this.status', 'pending'] } } } },
              approved: { $size: { $filter: { input: '$checks', cond: { $eq: ['$$this.status', 'approved'] } } } },
              validUntil: {
                $max: {
                  $map: {
                    input: { $filter: { input: '$checks', cond: { $and: [{ $eq: ['$$this.status', 'approved'] }, { $gt: ['$$this.expiresAt', now] }] } } },
                    in: '$$this.expiresAt',
                  },
                },
              },
            },
            in: {
              $switch: {
                branches: [
                  { case: { $gt: ['$$pending', 0] }, then: 'pending' },
                  { case: { $and: [{ $gt: ['$$approved', 0] }, { $eq: [{ $ifNull: ['$$validUntil', null] }, null] }] }, then: 'expired' },
                  { case: { $and: [{ $ne: [{ $ifNull: ['$$validUntil', null] }, null] }, { $lte: ['$$validUntil', soon] }] }, then: 'expiring' },
                ],
                default: null,
              },
            },
          },
        },
      },
    },
  ];
}

/**
 * The admin's goalkeeper list (admin spec 005, research §5): the profile's own filters first (its
 * indexes), then the operating balance (`_id` = the goalkeeper's user id; none = balance 0) and its filter,
 * newest activations first, one page and the total.
 */
export function goalkeepersListPipeline(filter: GoalkeeperListFilter): Document[] {
  const own: Document = {};
  if (filter.userIds !== undefined) own.userId = { $in: [...filter.userIds] };
  if (filter.marketId !== undefined) own.marketId = filter.marketId;
  else if (filter.marketIds !== undefined) own.marketId = { $in: [...filter.marketIds] };
  if (filter.zoneId !== undefined) own.zoneIds = filter.zoneId;
  if (filter.suspended === true) own.suspendedUntil = { $gt: filter.now };
  if (filter.suspended === false) own.$or = [{ suspendedUntil: null }, { suspendedUntil: { $lte: filter.now } }];
  // `$ne: false` also matches profiles activated before the switch existed, as the offers do.
  if (filter.availableForOffers !== undefined) own.availableForOffers = filter.availableForOffers ? { $ne: false } : false;
  // Admin spec 030: a profile without vetting is unvalidated.
  if (filter.vetting === 'unvalidated') own['vetting.validation'] = { $ne: 'validated' };
  if (filter.vetting === 'validated') Object.assign(own, { 'vetting.validation': 'validated', 'vetting.verification': null });
  if (filter.vetting === 'verified') Object.assign(own, { 'vetting.validation': 'validated', 'vetting.verification': { $ne: null } });
  if (filter.verificationMethod !== undefined) own['vetting.verification.method'] = filter.verificationMethod;

  const pipeline: Document[] = Object.keys(own).length > 0 ? [{ $match: own }] : [];
  pipeline.push(
    { $lookup: { from: OPERATING_BALANCES_COLLECTION, localField: 'userId', foreignField: '_id', as: 'operatingBalance', pipeline: [{ $project: { balance: 1, currency: 1 } }] } },
    { $addFields: { balance: { $ifNull: [{ $first: '$operatingBalance.balance' }, 0] }, currency: { $first: '$operatingBalance.currency' } } },
  );
  if (filter.balanceBelow !== undefined) pipeline.push({ $match: { balance: { $lt: filter.balanceBelow } } });
  pipeline.push(...backgroundCheckAlertSteps(filter.now));
  if (filter.backgroundCheck !== undefined) pipeline.push({ $match: { backgroundCheckAlert: filter.backgroundCheck } });
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
