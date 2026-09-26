import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { CityRepository } from '../../../../../src/infrastructure/persistence/mongo/cityRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new CityRepository(db);
}

describe('CityRepository (mocked driver)', () => {
  it('maps getById result, defaulting zoneCityId to null when absent', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia' });
    const repository = repositoryWith(collection);

    const found = await repository.getById('city-medellin');

    expect(found?.name).toBe('Medellín');
    expect(found?.zoneCityId).toBeNull();
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
    collection.find.mockReturnValue(toArrayCursor([{ _id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }]));
    const repository = repositoryWith(collection);

    const found = await repository.searchByName('envi', 15);

    expect(collection.find).toHaveBeenCalledWith({ name: { $regex: 'envi', $options: 'i' } });
    expect(found[0]?.zoneCityId).toBe('city-medellin');
  });

  it('ensureIndexes creates the name-search and zoneCityId indexes', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ name: 1 }, expect.any(Object));
    expect(collection.createIndex).toHaveBeenCalledWith({ zoneCityId: 1 }, expect.any(Object));
  });

  it('maps timeZone when present', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({
      _id: 'city-medellin',
      name: 'Medellín',
      regionId: 'region-antioquia',
      timeZone: 'America/Bogota',
    });
    const repository = repositoryWith(collection);

    const found = await repository.getById('city-medellin');

    expect(found?.timeZone).toBe('America/Bogota');
  });

  it('defaults timeZone to null when absent', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia' });
    const repository = repositoryWith(collection);

    const found = await repository.getById('city-medellin');

    expect(found?.timeZone).toBeNull();
  });
});
