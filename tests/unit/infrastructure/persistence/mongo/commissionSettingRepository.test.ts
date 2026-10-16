import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { CommissionSettingRepository } from '../../../../../src/infrastructure/persistence/mongo/commissionSettingRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new CommissionSettingRepository(db);
}

describe('CommissionSettingRepository (mocked driver)', () => {
  it('creates the one-setting-per-scope-and-reference index', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.dropIndex).toHaveBeenCalledWith('scope_refId');
    expect(collection.createIndex).toHaveBeenCalledWith(
      { scope: 1, refId: 1, modality: 1, level: 1 },
      { name: 'scope_refId_modality_level', unique: true },
    );
  });

  it('reads the settings of all three levels in one query and maps them', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'c-1', scope: 'country', refId: 'country-co', amount: 7000 }]));

    const found = await repositoryWith(collection).findFor({ zoneIds: ['z-1'], marketIds: ['city-a'], countryIds: ['country-co'] });

    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'zone', refId: { $in: ['z-1'] } },
        { scope: 'market', refId: { $in: ['city-a'] } },
        { scope: 'country', refId: { $in: ['country-co'] } },
      ],
    });
    expect(found[0]).toMatchObject({ scope: 'country', refId: 'country-co', amount: 7000, modality: null, level: null });
  });

  it('does not query when nothing is asked for', async () => {
    const collection = createFakeCollection();

    expect(await repositoryWith(collection).findFor({ zoneIds: [], marketIds: [], countryIds: [] })).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});

describe('CommissionSettingRepository — admin web (spec 004 of the admin)', () => {
  const stored = { _id: 'c1', scope: 'country', refId: 'co', amount: 7000 };

  it('finds the commissions of the given refs and modality', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([stored]));
    const found = await repositoryWith(collection).find({ refs: [{ scope: 'country', refIds: ['co'] }], modality: 'general' });
    expect(collection.find).toHaveBeenCalledWith({ $or: [{ scope: 'country', refId: { $in: ['co'] } }], modality: null });
    expect(found).toEqual([{ id: 'c1', scope: 'country', refId: 'co', modality: null, level: null, amount: 7000, revision: 0, invalid: false }]);
  });

  it('marks a seeded commission the domain refuses', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...stored, amount: 0 }]));
    expect((await repositoryWith(collection).find({ refs: null }))[0]?.invalid).toBe(true);
  });

  it('creates with explicit nulls, and answers duplicate on the unique index', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    collection.findOne.mockResolvedValue({ _id: 'c1' });
    const repository = repositoryWith(collection);
    const input = { id: 'c2', scope: 'zone' as const, refId: 'poblado', modality: null, level: null, amount: 9000 };

    expect(await repository.create(input)).toEqual({ outcome: 'created' });
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'c2', scope: 'zone', refId: 'poblado', modality: null, level: null, amount: 9000, revision: 0 });
    expect(await repository.create(input)).toEqual({ outcome: 'duplicate', existingId: 'c1' });
  });

  it('reads, edits the amount at a revision and deletes', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(stored);
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    const repository = repositoryWith(collection);

    expect(await repository.getById('c1')).toMatchObject({ id: 'c1', amount: 7000 });
    expect(await repository.updateAmount('c1', 0, 8000)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'c1', $or: [{ revision: 0 }, { revision: { $exists: false } }] },
      { $set: { amount: 8000 }, $inc: { revision: 1 } },
    );
    expect(await repository.delete('c1')).toBe(false);
  });
});
