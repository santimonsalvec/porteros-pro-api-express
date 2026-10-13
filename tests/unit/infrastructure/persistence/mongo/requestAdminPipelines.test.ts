import { describe, expect, it } from 'vitest';
import type { Document } from 'mongodb';
import { requestsListPipeline } from '../../../../../src/infrastructure/persistence/mongo/requestAdminPipelines.js';

const BASE = { page: 2, pageSize: 20 };
const stage = (pipeline: Document[], name: string) => pipeline.filter((step) => name in step);
const indexOf = (pipeline: Document[], name: string) => pipeline.findIndex((step) => name in step);

describe('requestsListPipeline (admin spec 006, research §6)', () => {
  it('without filters, counts each request bookings by status, newest match first, and pages with a total', () => {
    const pipeline = requestsListPipeline(BASE);

    expect(stage(pipeline, '$match')).toEqual([]);
    const [lookup] = stage(pipeline, '$lookup');
    expect(lookup).toEqual({
      $lookup: { from: 'bookings', localField: '_id', foreignField: 'requestId', as: 'bookings', pipeline: [{ $project: { _id: 0, status: 1 } }] },
    });
    const counted = stage(pipeline, '$addFields')[0]!.$addFields;
    expect(Object.keys(counted)).toEqual(['pending', 'assigned', 'completed', 'cancelled', 'expired']);
    expect(counted.pending).toEqual({ $size: { $filter: { input: '$bookings', cond: { $eq: ['$$this.status', 'pending_assignment'] } } } });
    expect(stage(pipeline, '$sort')).toEqual([{ $sort: { startsAt: -1, _id: -1 } }]);
    const facet = stage(pipeline, '$facet')[0]!.$facet;
    expect(facet.items).toEqual(expect.arrayContaining([{ $skip: 20 }, { $limit: 20 }]));
    expect(facet.total).toEqual([{ $count: 'count' }]);
  });

  it("filters the request's own fields before looking up its bookings", () => {
    const from = new Date('2026-10-18T05:00:00.000Z');
    const to = new Date('2026-10-19T05:00:00.000Z');
    const pipeline = requestsListPipeline({
      ...BASE,
      from,
      to,
      zoneId: 'laureles',
      cityIds: ['med', 'bello'],
      clientId: 'c-1',
      requestIds: ['r-1', 'r-2'],
    });

    expect(pipeline[0]).toEqual({
      $match: {
        startsAt: { $gte: from, $lt: to },
        zoneId: 'laureles',
        'match.cityId': { $in: ['med', 'bello'] },
        clientId: 'c-1',
        _id: { $in: ['r-1', 'r-2'] },
      },
    });
    expect(indexOf(pipeline, '$match')).toBeLessThan(indexOf(pipeline, '$lookup'));
  });

  it('filters by status on the counts, after the lookup', () => {
    const pipeline = requestsListPipeline({ ...BASE, status: 'partially_assigned' });

    const matches = stage(pipeline, '$match');
    expect(matches).toEqual([{ $match: { $and: [{ pending: { $gt: 0 } }, { assigned: { $gt: 0 } }] } }]);
    expect(pipeline.indexOf(matches[0]!)).toBeGreaterThan(indexOf(pipeline, '$addFields'));
  });

  it('keeps only what a row needs', () => {
    const facet = stage(requestsListPipeline(BASE), '$facet')[0]!.$facet;
    const project = facet.items.find((step: Document) => '$project' in step).$project;

    expect(project).toEqual({
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
    });
  });
});

describe('requestsListPipeline, one side of the dates at a time', () => {
  it('filters from a match start, or up to one', () => {
    const day = new Date('2026-10-18T05:00:00.000Z');
    expect(requestsListPipeline({ page: 1, pageSize: 20, from: day })[0]).toEqual({ $match: { startsAt: { $gte: day } } });
    expect(requestsListPipeline({ page: 1, pageSize: 20, to: day })[0]).toEqual({ $match: { startsAt: { $lt: day } } });
  });
});
