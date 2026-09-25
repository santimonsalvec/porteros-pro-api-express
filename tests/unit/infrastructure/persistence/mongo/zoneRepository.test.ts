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

  it('finds the active zone containing a point with $geoIntersects in [longitude, latitude] order, lowest displayOrder then _id first', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([doc]);
    collection.find.mockReturnValue(cursor);
    const repository = repositoryWith(collection);

    const found = await repository.findActiveContainingPoint(6.2442, -75.5812);

    expect(collection.find).toHaveBeenCalledWith({
      active: true,
      geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [-75.5812, 6.2442] } } },
    });
    expect(cursor.sort).toHaveBeenCalledWith({ displayOrder: 1, _id: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(1);
    expect(found?.id).toBe('zone-bello');
  });

  it('returns null when no active zone contains the point', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([]));
    const repository = repositoryWith(collection);

    expect(await repository.findActiveContainingPoint(0, 0)).toBeNull();
  });

  it('never creates a 2dsphere index from ensureIndexes (an invalid polygon would fail the build at startup)', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    for (const call of collection.createIndex.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('2dsphere');
    }
  });
});
