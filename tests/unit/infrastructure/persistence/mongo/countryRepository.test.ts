import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db, type Document } from 'mongodb';
import { CountryRepository, MongoAdminCountryRepository } from '../../../../../src/infrastructure/persistence/mongo/countryRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { Country } from '../../../../../src/domain/countries/country.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new CountryRepository(db);
}

describe('CountryRepository (mocked driver)', () => {
  it('tolerates an ObjectId _id, exposing it as a string', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: new ObjectId(), name: 'Colombia', dialCode: '+57', countryCode: 'CO' });
    const repository = repositoryWith(collection);

    const found = await repository.findByCountryCode('CO');

    expect(typeof found?.id).toBe('string');
    expect(found?.name).toBe('Colombia');
  });

  it('tolerates a string _id', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'us-string-id', name: 'United States', dialCode: '+1', countryCode: 'US' });
    const repository = repositoryWith(collection);

    const found = await repository.findByCountryCode('US');

    expect(found?.id).toBe('us-string-id');
  });

  it('queries by countryCode', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = repositoryWith(collection);

    await repository.findByCountryCode('ZZ');

    expect(collection.findOne).toHaveBeenCalledWith({ countryCode: 'ZZ' });
  });

  it('rejects write operations without touching the driver', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await expect(repository.add()).rejects.toThrow();
    await expect(repository.update()).rejects.toThrow();
    await expect(repository.delete()).rejects.toThrow();
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('maps the currency when present', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' });
    const repository = repositoryWith(collection);

    expect((await repository.getById('co'))?.currency).toBe('COP');
  });

  it('defaults the currency to null when absent', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' });
    const repository = repositoryWith(collection);

    expect((await repository.getById('co'))?.currency).toBeNull();
  });

  it('reads a malformed currency as-is instead of throwing, so the profile and country endpoints keep working', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'peso' });
    const repository = repositoryWith(collection);

    expect((await repository.getById('co'))?.currency).toBe('peso');
  });
});

describe('MongoAdminCountryRepository (admin spec 003)', () => {
  const adminWith = (collection: ReturnType<typeof createFakeCollection>) =>
    new MongoAdminCountryRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db);
  const co = { _id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP', revision: 1 };

  it('lists by name prefix, sorted and paged, with the total', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([co]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(1);

    const found = await adminWith(collection).list({ q: 'col', page: 2, pageSize: 10 });

    expect(collection.find).toHaveBeenCalledWith({ $and: [{ name: { $regex: '^col', $options: 'i' } }] });
    expect(cursor.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(cursor.skip).toHaveBeenCalledWith(10);
    expect(found).toMatchObject({ totalItems: 1, items: [{ id: 'co', revision: 1 }] });
  });

  it('finds by code without caring about case, and by several ids', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(co);
    collection.find.mockReturnValue(toArrayResult([co]));
    const repository = adminWith(collection);

    expect((await repository.findByCode('co'))?.id).toBe('co');
    expect(collection.findOne).toHaveBeenCalledWith({ countryCode: { $regex: '^co$', $options: 'i' } });
    expect((await repository.getByIds(['co'])).map((c) => c.id)).toEqual(['co']);
  });

  it('creates at revision 0, updates at the revision read and deletes', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = adminWith(collection);
    const ecuador = new Country({ id: 'ec', name: 'Ecuador', dialCode: '+593', countryCode: 'EC', currency: 'USD', revision: 2 });

    await repository.create(ecuador);
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'ec', name: 'Ecuador', dialCode: '+593', countryCode: 'EC', currency: 'USD', revision: 0 });
    expect(await repository.update(ecuador)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'ec', revision: 2 },
      { $set: { name: 'Ecuador', dialCode: '+593', countryCode: 'EC', currency: 'USD' }, $inc: { revision: 1 } },
    );
    expect(await repository.delete('ec')).toBe(true);
  });
});
