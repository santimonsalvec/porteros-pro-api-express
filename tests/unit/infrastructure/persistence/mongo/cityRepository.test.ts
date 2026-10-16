import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { CityRepository } from '../../../../../src/infrastructure/persistence/mongo/cityRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { City } from '../../../../../src/domain/locations/city.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new CityRepository(db);
}

describe('CityRepository (mocked driver)', () => {
  it('maps getById result, ignoring the operation fields of the old catalog (spec 031)', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null, timeZone: 'America/Bogota' });
    const repository = repositoryWith(collection);

    const found = await repository.getById('city-medellin');

    expect(found?.name).toBe('Medellín');
    expect(found).not.toHaveProperty('zoneCityId');
    expect(found).not.toHaveProperty('timeZone');
  });

  it('getByIds reads the given ids with $in and maps each city', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([{ _id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia' }]));

    const found = await repositoryWith(collection).getByIds(['city-medellin', 'city-missing']);

    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['city-medellin', 'city-missing'] } });
    expect(found.map((city) => city.name)).toEqual(['Medellín']);
  });

  it('getByIds does not query for an empty list', async () => {
    const collection = createFakeCollection();

    expect(await repositoryWith(collection).getByIds([])).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });

  it('searches by a case-insensitive regex on name, capped at the given limit', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([{ _id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia' }]));
    const repository = repositoryWith(collection);

    const found = await repository.searchByName('envi', 15);

    expect(collection.find).toHaveBeenCalledWith({ name: { $regex: 'envi', $options: 'i' } });
    expect(found[0]?.name).toBe('Envigado');
  });

  it('ensureIndexes creates the name-search index and no anchor index', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ name: 1 }, expect.any(Object));
    expect(collection.createIndex).not.toHaveBeenCalledWith({ zoneCityId: 1 }, expect.any(Object));
  });

  it('maps the DANE codes as text, and null when absent (feature 023)', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce({ _id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', daneStateCode: '05', daneCityCode: 5001 });
    collection.findOne.mockResolvedValueOnce({ _id: 'city-x', name: 'X', regionId: 'region-antioquia' });
    const repository = repositoryWith(collection);

    expect(await repository.getById('city-medellin')).toMatchObject({ daneStateCode: '05', daneCityCode: '5001' });
    expect(await repository.getById('city-x')).toMatchObject({ daneStateCode: null, daneCityCode: null });
  });
});

describe('CityRepository admin methods (spec 003 of the admin)', () => {
  const listed = (collection: ReturnType<typeof createFakeCollection>) => {
    const cursor = toArrayCursor([{ _id: 'med', name: 'Medellín', regionId: 'ant', revision: 2 }]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(41);
    return cursor;
  };

  it('lists by regions and name prefix, sorted and paged, with the total', async () => {
    const collection = createFakeCollection();
    const cursor = listed(collection);

    const found = await repositoryWith(collection).list({ regionIds: ['ant'], q: 'Me.d', page: 3, pageSize: 20 });

    const filter = { $and: [{ regionId: { $in: ['ant'] } }, { name: { $regex: '^Me\\.d', $options: 'i' } }] };
    expect(collection.find).toHaveBeenCalledWith(filter);
    expect(collection.countDocuments).toHaveBeenCalledWith(filter);
    expect(cursor.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(cursor.skip).toHaveBeenCalledWith(40);
    expect(cursor.limit).toHaveBeenCalledWith(20);
    expect(found.totalItems).toBe(41);
    expect(found.items[0]!.revision).toBe(2);
  });

  it('lists everything without filters', async () => {
    const collection = createFakeCollection();
    listed(collection);
    await repositoryWith(collection).list({ page: 1, pageSize: 20 });
    expect(collection.find).toHaveBeenLastCalledWith({});
  });

  it('counts cities per region', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);
    collection.aggregate.mockReturnValue(toArrayResult([{ _id: 'ant', count: 125 }]));
    expect(await repository.countByRegion(['ant'])).toEqual(new Map([['ant', 125]]));
  });

  it('creates a city at revision 0, with its codes as text', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).create(
      new City({ id: 'env', name: 'Envigado', regionId: 'ant', daneStateCode: '05', daneCityCode: '05266' }),
    );

    expect(collection.insertOne).toHaveBeenCalledWith({
      _id: 'env',
      name: 'Envigado',
      regionId: 'ant',
      daneStateCode: '05',
      daneCityCode: '05266',
      revision: 0,
    });
  });

  it('updates at the revision read and reports a stale write', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const city = new City({ id: 'env', name: 'Envigado', regionId: 'ant', revision: 4 });

    expect(await repositoryWith(collection).update(city)).toBe('stale');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'env', revision: 4 },
      {
        $set: { name: 'Envigado', regionId: 'ant', daneStateCode: null, daneCityCode: null },
        $inc: { revision: 1 },
      },
    );
  });

  it('deletes by id, text or ObjectId', async () => {
    const collection = createFakeCollection();
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });

    expect(await repositoryWith(collection).delete('env')).toBe(true);
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: 'env' });
  });

  it('indexes cities by region and name', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();
    expect(collection.createIndex).toHaveBeenCalledWith({ regionId: 1, name: 1 }, { name: 'region_name' });
  });
});
