import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { ZoneRepository } from '../../../../../src/infrastructure/persistence/mongo/zoneRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

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

describe('ZoneRepository admin methods (spec 003)', () => {
  it("lists all of a city's zones, active or not, by order then id", async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([doc]);
    collection.find.mockReturnValue(cursor);

    const zones = await repositoryWith(collection).listByCity('city-medellin');

    expect(collection.find).toHaveBeenCalledWith({ cityId: 'city-medellin' });
    expect(cursor.sort).toHaveBeenCalledWith({ displayOrder: 1, _id: 1 });
    expect(zones.map((zone) => zone.id)).toEqual(['zone-bello']);
  });

  it('finds by id and by slug, counts per city and lists the cities with zones', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(doc);
    collection.aggregate.mockReturnValue(toArrayResult([{ _id: 'city-medellin', count: 12 }]));
    collection.distinct.mockResolvedValue(['city-medellin']);
    const repository = repositoryWith(collection);

    expect((await repository.getById('zone-bello'))?.slug).toBe('medellin-co-bello');
    await repository.findBySlug('medellin-co-bello');
    expect(collection.findOne).toHaveBeenLastCalledWith({ slug: 'medellin-co-bello' });
    expect(await repository.countByCity(['city-medellin'])).toEqual(new Map([['city-medellin', 12]]));
    expect(await repository.zoneOwnerIds()).toEqual(['city-medellin']);
    expect(collection.distinct).toHaveBeenCalledWith('cityId');
  });

  it('creates at revision 0, updates at the revision read (the city never changes) and deletes', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = repositoryWith(collection);
    const zone = new Zone({ ...doc, id: 'z9', revision: 3 } as never);

    await repository.create(zone);
    expect(collection.insertOne).toHaveBeenCalledWith({
      _id: 'z9', cityId: doc.cityId, name: doc.name, slug: doc.slug, geometry: doc.geometry, active: doc.active, displayOrder: doc.displayOrder, revision: 0,
    });
    await repository.update(zone);
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'z9', revision: 3 },
      { $set: { name: doc.name, slug: doc.slug, geometry: doc.geometry, active: doc.active, displayOrder: doc.displayOrder }, $inc: { revision: 1 } },
    );
    expect(await repository.delete('z9')).toBe(true);
  });

  it('still creates no 2dsphere or unique index', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();
    for (const [, options] of collection.createIndex.mock.calls) expect(options?.unique).toBeUndefined();
    expect(JSON.stringify(collection.createIndex.mock.calls)).not.toContain('2dsphere');
  });
});

describe('ZoneRepository.summariesByCities (admin lists and readiness)', () => {
  it('reads the zones of many cities in one query, without their polygons', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([{ ...doc, geometry: undefined, revision: 2 }]);
    collection.find.mockReturnValue(cursor);

    const zones = await repositoryWith(collection).summariesByCities(['city-medellin', 'city-cali']);

    expect(collection.find).toHaveBeenCalledWith({ cityId: { $in: ['city-medellin', 'city-cali'] } }, { projection: { geometry: 0 } });
    expect(cursor.sort).toHaveBeenCalledWith({ displayOrder: 1, _id: 1 });
    expect(zones).toEqual([
      { id: 'zone-bello', cityId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', active: true, displayOrder: 1, revision: 2 },
    ]);
  });

  it('asks nothing for no cities', async () => {
    const collection = createFakeCollection();
    expect(await repositoryWith(collection).summariesByCities([])).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});
