import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { RegionRepository } from '../../../../../src/infrastructure/persistence/mongo/regionRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { Region } from '../../../../../src/domain/locations/region.js';

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

describe('RegionRepository for the admin (spec 003)', () => {
  it("reads a country's regions", async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'ant', name: 'Antioquia', countryId: 'co' }]));

    const regions = await repositoryWith(collection).getByCountry('co');

    expect(collection.find).toHaveBeenCalledWith({ countryId: 'co' });
    expect(regions.map((region) => region.id)).toEqual(['ant']);
  });

  it('indexes regions by country and name', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();
    expect(collection.createIndex).toHaveBeenCalledWith({ countryId: 1, name: 1 }, { name: 'country_name' });
  });
});

describe('RegionRepository admin methods (spec 003)', () => {
  it('lists by country and name prefix, sorted and paged', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([{ _id: 'ant', name: 'Antioquia', countryId: 'co' }]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(33);

    const found = await repositoryWith(collection).list({ countryId: 'co', q: 'an', page: 1, pageSize: 20 });

    expect(collection.find).toHaveBeenCalledWith({ $and: [{ countryId: 'co' }, { name: { $regex: '^an', $options: 'i' } }] });
    expect(cursor.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(found.totalItems).toBe(33);
  });

  it('counts regions per country, gets one, creates, updates and deletes', async () => {
    const collection = createFakeCollection();
    collection.aggregate.mockReturnValue(toArrayResult([{ _id: 'co', count: 33 }]));
    collection.findOne.mockResolvedValue({ _id: 'ant', name: 'Antioquia', countryId: 'co' });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    const repository = repositoryWith(collection);

    expect(await repository.countByCountry(['co'])).toEqual(new Map([['co', 33]]));
    expect((await repository.getById('ant'))?.name).toBe('Antioquia');
    await repository.create(new Region({ id: 'pic', name: 'Pichincha', countryId: 'ec' }));
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'pic', name: 'Pichincha', countryId: 'ec', revision: 0 });
    expect(await repository.update(new Region({ id: 'pic', name: 'Pichincha', countryId: 'ec' }))).toBe('saved');
    expect(await repository.delete('pic')).toBe(false);
  });
});
