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

    const found = await repositoryWith(collection).findFor({ zoneIds: ['z-1'], cityIds: ['city-a'], countryIds: ['country-co'] });

    expect(collection.find).toHaveBeenCalledWith({
      $or: [
        { scope: 'zone', refId: { $in: ['z-1'] } },
        { scope: 'city', refId: { $in: ['city-a'] } },
        { scope: 'country', refId: { $in: ['country-co'] } },
      ],
    });
    expect(found[0]).toMatchObject({ scope: 'country', refId: 'country-co', amount: 7000, modality: null, level: null });
  });

  it('does not query when nothing is asked for', async () => {
    const collection = createFakeCollection();

    expect(await repositoryWith(collection).findFor({ zoneIds: [], cityIds: [], countryIds: [] })).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});
