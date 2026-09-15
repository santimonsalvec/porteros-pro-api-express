import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { ZoneRepository } from '../../../../../src/infrastructure/persistence/mongo/zoneRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new ZoneRepository(db);
}

const doc = {
  _id: 'zone-bello',
  cityId: 'city-medellin',
  name: 'Bello',
  slug: 'medellin-co-bello',
  geometry: { type: 'Polygon', coordinates: [] },
  active: true,
  displayOrder: 1,
};

describe('ZoneRepository (mocked driver)', () => {
  it('fetches only active zones for an anchor, sorted by displayOrder', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([doc]));
    const repository = repositoryWith(collection);

    const found = await repository.getActiveByCityId('city-medellin');

    expect(collection.find).toHaveBeenCalledWith({ cityId: 'city-medellin', active: true });
    expect(found[0]?.slug).toBe('medellin-co-bello');
  });

  it('fetches multiple zones by id via $in', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([doc]));
    const repository = repositoryWith(collection);

    const found = await repository.getManyByIds(['zone-bello']);

    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['zone-bello'] } });
    expect(found).toHaveLength(1);
  });

  it('computes which anchor city ids have at least one active zone via distinct', async () => {
    const collection = createFakeCollection();
    collection.distinct.mockResolvedValue(['city-medellin']);
    const repository = repositoryWith(collection);

    const found = await repository.hasActiveZonesForCityIds(['city-medellin', 'city-bogota']);

    expect(collection.distinct).toHaveBeenCalledWith('cityId', { cityId: { $in: ['city-medellin', 'city-bogota'] }, active: true });
    expect(found).toEqual(new Set(['city-medellin']));
  });

  it('ensureIndexes creates the cityId/active/displayOrder index', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ cityId: 1, active: 1, displayOrder: 1 }, expect.any(Object));
  });
});
