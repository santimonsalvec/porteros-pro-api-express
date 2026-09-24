import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { RegionRepository } from '../../../../../src/infrastructure/persistence/mongo/regionRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new RegionRepository(db);
}

describe('RegionRepository (mocked driver)', () => {
  it('fetches multiple regions by id via $in', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'region-antioquia', name: 'Antioquia' }]));
    const repository = repositoryWith(collection);

    const found = await repository.getByIds(['region-antioquia']);

    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['region-antioquia'] } });
    expect(found[0]?.name).toBe('Antioquia');
  });

  it('returns an empty array without querying when given no ids', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    const found = await repository.getByIds([]);

    expect(found).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });

  it('maps countryId when present and defaults it to null when absent', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(
      toArrayResult([
        { _id: 'region-antioquia', name: 'Antioquia', countryId: 'country-co' },
        { _id: 'region-x', name: 'X' },
      ]),
    );
    const repository = repositoryWith(collection);

    const found = await repository.getByIds(['region-antioquia', 'region-x']);

    expect(found[0]?.countryId).toBe('country-co');
    expect(found[1]?.countryId).toBeNull();
  });
});
