import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { CommissionSettingRepository } from '../../../../../src/infrastructure/persistence/mongo/commissionSettingRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new CommissionSettingRepository(db);
}

const validUntil = new Date('2026-10-31T23:59:00Z');

describe('CommissionSettingRepository (mocked driver)', () => {
  it('creates the one-setting-per-scope-and-reference index', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.dropIndex).toHaveBeenCalledWith('scope_refId');
    expect(collection.dropIndex).toHaveBeenCalledWith('scope_refId_modality_level');
    expect(collection.deleteMany).toHaveBeenCalledWith({ level: { $ne: null } });
    expect(collection.createIndex).toHaveBeenCalledWith(
      { scope: 1, refId: 1, modality: 1 },
      { name: 'scope_refId_modality', unique: true },
    );
  });

  it('reads the settings of the geography levels in one query and maps them', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'c-1', scope: 'country', refId: 'country-co', fixedAmount: 7000, percentBps: 0 }]));

    const found = await repositoryWith(collection).findFor({ zoneIds: ['z-1'], marketIds: ['city-a'], countryIds: ['country-co'] });

    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'zone', refId: { $in: ['z-1'] } },
        { scope: 'market', refId: { $in: ['city-a'] } },
        { scope: 'country', refId: { $in: ['country-co'] } },
      ],
    });
    expect(found[0]).toMatchObject({ scope: 'country', refId: 'country-co', fixedAmount: 7000, percentBps: 0, modality: null, countryId: null, validUntil: null });
  });

  it('reads a legacy document (only amount) as a fixed rule (feature 033, research §7)', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'c-old', scope: 'zone', refId: 'z-1', amount: 5000 }]));
    const [found] = await repositoryWith(collection).findFor({ zoneIds: ['z-1'], marketIds: [], countryIds: [] });
    expect(found).toMatchObject({ fixedAmount: 5000, percentBps: 0, kind: 'fixed' });
  });

  it('reads goalkeeper rules with their country and validity when goalkeeper ids are given', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'c-g', scope: 'goalkeeper', refId: 'user-1', fixedAmount: 0, percentBps: 500, countryId: 'country-co', validUntil }]));

    const found = await repositoryWith(collection).findFor({ zoneIds: ['z-1'], marketIds: [], countryIds: [], goalkeeperIds: ['user-1'] });

    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'zone', refId: { $in: ['z-1'] } },
        { scope: 'goalkeeper', refId: { $in: ['user-1'] } },
      ],
    });
    expect(found[0]).toMatchObject({ scope: 'goalkeeper', refId: 'user-1', percentBps: 500, countryId: 'country-co', validUntil });
  });

  it('does not query when nothing is asked for', async () => {
    const collection = createFakeCollection();

    expect(await repositoryWith(collection).findFor({ zoneIds: [], marketIds: [], countryIds: [] })).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});

describe('CommissionSettingRepository — admin web (spec 004 of the admin, feature 033)', () => {
  const stored = { _id: 'c1', scope: 'country', refId: 'co', fixedAmount: 7000, percentBps: 0 };

  it('finds the commissions of the given refs and modality', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([stored]));
    const found = await repositoryWith(collection).find({ refs: [{ scope: 'country', refIds: ['co'] }], modality: 'general' });
    expect(collection.find).toHaveBeenCalledWith({ $or: [{ scope: 'country', refId: { $in: ['co'] } }], modality: null });
    expect(found).toEqual([
      { id: 'c1', scope: 'country', refId: 'co', modality: null, fixedAmount: 7000, percentBps: 0, countryId: null, validUntil: null, revision: 0, invalid: false },
    ]);
  });

  it('records a legacy document with its amount as the fixed component', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'c1', scope: 'country', refId: 'co', amount: 7000 }]));
    expect((await repositoryWith(collection).find({ refs: null }))[0]).toMatchObject({ fixedAmount: 7000, percentBps: 0, invalid: false });
  });

  it('marks a seeded commission the domain refuses', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ ...stored, fixedAmount: 0, percentBps: 0 }]));
    expect((await repositoryWith(collection).find({ refs: null }))[0]?.invalid).toBe(true);
  });

  it('creates with explicit nulls and both components, and answers duplicate on the unique index', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    collection.findOne.mockResolvedValue({ _id: 'c1' });
    const repository = repositoryWith(collection);
    const input = { id: 'c2', scope: 'zone' as const, refId: 'poblado', modality: null, fixedAmount: 3000, percentBps: 1000, countryId: null, validUntil: null };

    expect(await repository.create(input)).toEqual({ outcome: 'created' });
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'c2', scope: 'zone', refId: 'poblado', modality: null, fixedAmount: 3000, percentBps: 1000, revision: 0 });
    expect(await repository.create(input)).toEqual({ outcome: 'duplicate', existingId: 'c1' });
  });

  it('creates a goalkeeper rule with its country and validity', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValueOnce({});
    await repositoryWith(collection).create({ id: 'c3', scope: 'goalkeeper', refId: 'user-1', modality: null, fixedAmount: 0, percentBps: 500, countryId: 'co', validUntil });
    expect(collection.insertOne).toHaveBeenCalledWith({
      _id: 'c3', scope: 'goalkeeper', refId: 'user-1', modality: null, fixedAmount: 0, percentBps: 500, countryId: 'co', validUntil, revision: 0,
    });
  });

  it('reads, edits both components at a revision (unsetting a legacy amount) and deletes', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(stored);
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    const repository = repositoryWith(collection);

    expect(await repository.getById('c1')).toMatchObject({ id: 'c1', fixedAmount: 7000 });
    expect(await repository.update('c1', 0, { fixedAmount: 0, percentBps: 1250 })).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'c1', $or: [{ revision: 0 }, { revision: { $exists: false } }] },
      { $set: { fixedAmount: 0, percentBps: 1250 }, $unset: { amount: '' }, $inc: { revision: 1 } },
    );
    expect(await repository.delete('c1')).toBe(false);
  });

  it('edits the validity of a goalkeeper rule when asked', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    await repositoryWith(collection).update('c3', 2, { fixedAmount: 0, percentBps: 500, validUntil: null });
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'c3', revision: 2 },
      { $set: { fixedAmount: 0, percentBps: 500, validUntil: null }, $unset: { amount: '' }, $inc: { revision: 1 } },
    );
  });
});
