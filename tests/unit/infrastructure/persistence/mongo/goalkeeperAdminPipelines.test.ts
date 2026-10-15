import { describe, expect, it } from 'vitest';
import type { Document } from 'mongodb';
import { goalkeepersListPipeline, ratingsPipeline } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperAdminPipelines.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const BASE = { now: NOW, page: 1, pageSize: 20 };
const matches = (pipeline: Document[]) => pipeline.filter((step) => '$match' in step).map((step) => step.$match);

describe('goalkeepersListPipeline (admin spec 005, research §5)', () => {
  it('without filters, joins the operatingBalance and pages the newest activations first', () => {
    const pipeline = goalkeepersListPipeline(BASE);

    expect(matches(pipeline)).toEqual([]);
    expect(pipeline).toContainEqual(expect.objectContaining({ $lookup: expect.objectContaining({ from: 'operatingBalances', localField: 'userId', foreignField: '_id' }) }));
    expect(pipeline).toContainEqual({ $addFields: { balance: { $ifNull: [{ $first: '$operatingBalance.balance' }, 0] }, currency: { $first: '$operatingBalance.currency' } } });
    expect(pipeline).toContainEqual({ $sort: { activatedAt: -1, _id: -1 } });
    const facet = pipeline.find((step) => '$facet' in step)!.$facet;
    expect(facet.total).toEqual([{ $count: 'count' }]);
    expect(facet.items).toEqual(expect.arrayContaining([{ $skip: 0 }, { $limit: 20 }]));
  });

  it('filters the profile by users, city, zone, suspension and offers before the join', () => {
    const pipeline = goalkeepersListPipeline({ ...BASE, userIds: ['u1'], cityId: 'med', zoneId: 'poblado', suspended: true, availableForOffers: false });

    expect(matches(pipeline)[0]).toEqual({
      userId: { $in: ['u1'] }, cityId: 'med', zoneIds: 'poblado', suspendedUntil: { $gt: NOW }, availableForOffers: false,
    });
  });

  it('a goalkeeper not suspended has no end or one already past; one with offers on matches the old profiles too', () => {
    expect(matches(goalkeepersListPipeline({ ...BASE, suspended: false, availableForOffers: true }))[0]).toEqual({
      $or: [{ suspendedUntil: null }, { suspendedUntil: { $lte: NOW } }], availableForOffers: { $ne: false },
    });
  });

  it('filters the balance after the operatingBalance join', () => {
    const pipeline = goalkeepersListPipeline({ ...BASE, balanceBelow: 10000 });

    expect(matches(pipeline)).toEqual([{ balance: { $lt: 10000 } }]);
  });
});

describe('ratingsPipeline', () => {
  it("averages the clients' stars of each goalkeeper", () => {
    expect(ratingsPipeline(['u1', 'u2'])).toEqual([
      { $match: { subjectId: { $in: ['u1', 'u2'] }, side: 'client' } },
      { $group: { _id: '$subjectId', average: { $avg: '$stars' }, count: { $sum: 1 } } },
    ]);
  });
});
