import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { UnverifiedDiscountRepository } from '../../../../../src/infrastructure/persistence/mongo/unverifiedDiscountRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new UnverifiedDiscountRepository(db);
}

describe('UnverifiedDiscountRepository (mocked driver, admin spec 030)', () => {
  it('allows one discount per level', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ scope: 1, refId: 1 }, { name: 'scope_ref_unique', unique: true });
  });

  it('reads the levels of some zones, cities and countries in one query', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'd-1', scope: 'city', refId: 'med', discountBps: 1000, revision: 2 }]));

    const found = await repositoryWith(collection).findFor({ zoneIds: ['z'], cityIds: ['med'], countryIds: [] });

    expect(found).toEqual([expect.objectContaining({ id: 'd-1', scope: 'city', refId: 'med', discountBps: 1000, verifiedPriorityMinutes: null, revision: 2 })]);
    expect(collection.find).toHaveBeenCalledWith({ $or: [{ scope: 'zone', refId: { $in: ['z'] } }, { scope: 'city', refId: { $in: ['med'] } }] });
    expect(await repositoryWith(createFakeCollection()).findFor({ zoneIds: [], cityIds: [], countryIds: [] })).toEqual([]);
  });

  it('creates at revision 0 and reports a level that already has one', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const repository = repositoryWith(collection);

    expect(await repository.create({ id: 'd-1', scope: 'zone', refId: 'z', discountBps: 1500, verifiedPriorityMinutes: null })).toEqual({ outcome: 'created' });
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'd-1', scope: 'zone', refId: 'z', discountBps: 1500, verifiedPriorityMinutes: null, revision: 0 });

    collection.insertOne.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    collection.findOne.mockResolvedValue({ _id: 'd-0' });
    expect(await repository.create({ id: 'd-2', scope: 'zone', refId: 'z', discountBps: 1500, verifiedPriorityMinutes: null })).toEqual({ outcome: 'duplicate', existingId: 'd-0' });
  });

  it('updates and deletes only at the revision read', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = repositoryWith(collection);

    expect(await repository.update('d-1', 2, { discountBps: 1200, verifiedPriorityMinutes: 20 })).toBe('stale');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'd-1', revision: 2 }, { $set: { discountBps: 1200, verifiedPriorityMinutes: 20 }, $inc: { revision: 1 } });

    expect(await repository.delete('d-1', 3)).toBe('deleted');
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: 'd-1', revision: 3 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    collection.findOne.mockResolvedValue({ _id: 'd-1', revision: 4 });
    expect(await repository.delete('d-1', 3)).toBe('stale');
    collection.findOne.mockResolvedValue(null);
    expect(await repository.delete('d-1', 3)).toBe('not_found');
  });
});
