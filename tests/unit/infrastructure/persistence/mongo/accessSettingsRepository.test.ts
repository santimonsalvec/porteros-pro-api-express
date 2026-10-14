import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { MongoAccessSettingsRepository } from '../../../../../src/infrastructure/persistence/mongo/accessSettingsRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const updatedAt = new Date('2026-10-14T15:02:00.000Z');

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const names: string[] = [];
  const db = { collection: (name: string) => (names.push(name), collection) } as unknown as Db;
  return { repository: new MongoAccessSettingsRepository(db), names };
}

describe('MongoAccessSettingsRepository (admin spec 009, research §5)', () => {
  it('reads the one global document of accessSettings', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'global', loginCodeExpiryMinutes: 5, revision: 2, updatedAt, updatedBy: 'user-1' });
    const { repository, names } = repositoryWith(collection);

    expect(await repository.get()).toEqual({ loginCodeExpiryMinutes: 5, revision: 2, updatedAt, updatedBy: 'user-1' });
    expect(names).toEqual(['accessSettings']);
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'global' });
  });

  it('answers null while nobody saved it', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(await repositoryWith(collection).repository.get()).toBeNull();
  });

  it('creates it at revision 0, and stale when someone created it first', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValueOnce({ acknowledged: true }).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    const { repository } = repositoryWith(collection);
    const settings = { loginCodeExpiryMinutes: 5, updatedAt, updatedBy: 'user-1' };

    expect(await repository.create(settings)).toBe('saved');
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'global', ...settings, revision: 0 });
    expect(await repository.create(settings)).toBe('stale');
  });

  it('updates only at the revision read, moving it up one', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
    const { repository } = repositoryWith(collection);
    const settings = { loginCodeExpiryMinutes: 3, updatedAt, updatedBy: 'user-2' };

    expect(await repository.update(settings, 2)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'global', revision: 2 }, { $set: settings, $inc: { revision: 1 } });
    expect(await repository.update(settings, 2)).toBe('stale');
  });
});
