import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db, type Document } from 'mongodb';
import { CountryRepository } from '../../../../../src/infrastructure/persistence/mongo/countryRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

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
});
