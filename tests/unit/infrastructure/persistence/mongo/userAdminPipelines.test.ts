import { describe, expect, it } from 'vitest';
import type { Document } from 'mongodb';
import { usersListPipeline } from '../../../../../src/infrastructure/persistence/mongo/userAdminPipelines.js';

const BASE = { page: 2, pageSize: 20 };
const stage = (pipeline: Document[], name: string) => pipeline.filter((step) => name in step);

describe('usersListPipeline (admin spec 005, research §4)', () => {
  it('without filters, reads every user, newest first, and pages with a total', () => {
    const pipeline = usersListPipeline(BASE);

    expect(stage(pipeline, '$match')).toEqual([]);
    expect(stage(pipeline, '$sort')).toEqual([{ $sort: { created: -1, _id: -1 } }]);
    const facet = stage(pipeline, '$facet')[0]!.$facet;
    expect(facet.items).toEqual(expect.arrayContaining([{ $skip: 20 }, { $limit: 20 }]));
    expect(facet.total).toEqual([{ $count: 'count' }]);
  });

  it('normalises the creation date, also of old documents that keep it under DateTime', () => {
    const pipeline = usersListPipeline(BASE);

    expect(pipeline).toContainEqual({ $addFields: { created: { $toDate: { $ifNull: ['$createdAt.DateTime', '$createdAt'] } } } });
  });

  it('searches, then filters by country and creation dates on the users themselves', () => {
    const from = new Date('2026-10-01T05:00:00.000Z');
    const to = new Date('2026-10-02T05:00:00.000Z');
    const pipeline = usersListPipeline({ ...BASE, q: 'gomez', countryCallingCode: '+57', createdFrom: from, createdTo: to });

    const [search, rest] = stage(pipeline, '$match');
    expect(search!.$match.$and).toHaveLength(1);
    expect(rest).toEqual({ $match: { countryCallingCode: '+57', created: { $gte: from, $lt: to } } });
  });

  it('finds whether each user is a goalkeeper and is blocked, and filters by it', () => {
    const pipeline = usersListPipeline({ ...BASE, role: 'goalkeeper', blocked: true });

    expect(pipeline).toContainEqual(expect.objectContaining({ $lookup: expect.objectContaining({ from: 'goalkeeperProfiles', localField: '_id', foreignField: 'userId' }) }));
    expect(pipeline).toContainEqual(expect.objectContaining({ $lookup: expect.objectContaining({ from: 'userBlocks', localField: '_id', foreignField: '_id' }) }));
    expect(stage(pipeline, '$match').at(-1)).toEqual({ $match: { isGoalkeeper: true, blocked: true } });
  });

  it('a client is a user without a goalkeeper profile', () => {
    expect(stage(usersListPipeline({ ...BASE, role: 'client' }), '$match').at(-1)).toEqual({ $match: { isGoalkeeper: false } });
  });

  it('never projects the phone number', () => {
    const projection = stage(stage(usersListPipeline(BASE), '$facet')[0]!.$facet.items, '$project')[0]!.$project;

    expect(projection).not.toHaveProperty('whatsAppNumber');
    expect(projection).not.toHaveProperty('normalizedPhoneNumber');
    expect(projection).toMatchObject({ email: 1, firstName: 1, lastName: 1, displayName: 1, countryCallingCode: 1, isGoalkeeper: 1, blocked: 1 });
  });
});
