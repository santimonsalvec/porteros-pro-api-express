import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { RatingRepository } from '../../../../../src/infrastructure/persistence/mongo/ratingRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new RatingRepository(db);
}

describe('RatingRepository.summaryForGoalkeeper (admin spec 030)', () => {
  it('counts and averages what clients gave the goalkeeper, on the subject_side index', async () => {
    const collection = createFakeCollection();
    collection.aggregate.mockReturnValue(toArrayResult([{ _id: null, count: 5, average: 4.6 }]));

    expect(await repositoryWith(collection).summaryForGoalkeeper('gk-1')).toEqual({ count: 5, average: 4.6 });
    expect(collection.aggregate).toHaveBeenCalledWith([
      { $match: { subjectId: 'gk-1', side: 'client' } },
      { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$stars' } } },
    ]);
  });

  it('is zero without ratings', async () => {
    const collection = createFakeCollection();
    collection.aggregate.mockReturnValue(toArrayResult([]));

    expect(await repositoryWith(collection).summaryForGoalkeeper('gk-1')).toEqual({ count: 0, average: null });
  });
});
