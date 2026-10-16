import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MarketRepository } from '../../../../../src/infrastructure/persistence/mongo/marketRepository.js';
import { Market } from '../../../../../src/domain/markets/market.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new MarketRepository(db);
}

const now = new Date('2026-10-15T12:00:00Z');
const market = Market.create(
  { id: 'mkt-1', name: 'Medellín', countryId: 'co', timeZone: 'America/Bogota', mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 }, createdBy: 's-1' },
  now,
);
const stored = {
  _id: 'mkt-1',
  name: 'Medellín',
  nameKey: 'medellin',
  countryId: 'co',
  timeZone: 'America/Bogota',
  mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 },
  status: 'enabled',
  enabledAt: now,
  enabledBy: 's-1',
  disabledAt: null,
  disabledBy: null,
  createdAt: now,
  createdBy: 's-1',
  updatedAt: now,
  revision: 3,
};

describe('MarketRepository (mocked driver, spec 031)', () => {
  it('keeps names unique per country and lists by status', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ countryId: 1, nameKey: 1 }, { name: 'country_name_unique', unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith({ status: 1, name: 1 }, { name: 'status' });
  });

  it('creates at revision 0 with the name key, and reports a taken name', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({});
    const repository = repositoryWith(collection);

    expect(await repository.create(market)).toBe('created');
    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'mkt-1', nameKey: 'medellin', status: 'draft', revision: 0 }));

    collection.insertOne.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await repository.create(market)).toBe('name_taken');
  });

  it('reads one, several, a country and the enabled ones by name', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(stored);
    collection.find.mockReturnValue(toArrayResult([stored]));
    const repository = repositoryWith(collection);

    const one = await repository.getById('mkt-1');
    expect(one).toMatchObject({ id: 'mkt-1', status: 'enabled', revision: 3, mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 } });
    expect(await repository.getByIds([])).toEqual([]);
    expect(await repository.getByIds(['mkt-1'])).toHaveLength(1);
    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['mkt-1'] } });

    await repository.listByCountry('co');
    expect(collection.find).toHaveBeenCalledWith({ countryId: 'co' }, { sort: { name: 1 } });
    await repository.listEnabled();
    expect(collection.find).toHaveBeenCalledWith({ status: 'enabled' }, { sort: { name: 1 } });
    await repository.list();
    expect(collection.find).toHaveBeenCalledWith({}, { sort: { name: 1 } });

    collection.findOne.mockResolvedValue(null);
    expect(await repository.getById('nope')).toBeNull();
  });

  it('updates only at the revision read, never the country', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const repository = repositoryWith(collection);

    expect(await repository.update(market.withEdits({ name: 'Medellín centro' }), 0)).toBe('saved');
    const [filter, update] = collection.updateOne.mock.calls[0]!;
    expect(filter).toEqual({ _id: 'mkt-1', $or: [{ revision: 0 }, { revision: { $exists: false } }] });
    expect(update.$set).toMatchObject({ name: 'Medellín centro', nameKey: 'medellin centro', status: 'draft' });
    expect(update.$set).not.toHaveProperty('countryId');

    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await repository.update(market, 2)).toBe('stale');
    collection.updateOne.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await repository.update(market, 2)).toBe('name_taken');
  });

  it('deletes only at the revision read', async () => {
    const collection = createFakeCollection();
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = repositoryWith(collection);

    expect(await repository.delete('mkt-1', 3)).toBe('deleted');
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: 'mkt-1', revision: 3 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 0 });
    collection.findOne.mockResolvedValue(stored);
    expect(await repository.delete('mkt-1', 3)).toBe('stale');
    collection.findOne.mockResolvedValue(null);
    expect(await repository.delete('mkt-1', 3)).toBe('not_found');
  });
});
