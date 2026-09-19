import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { GoalkeeperProfileRepository } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperProfileRepository.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new GoalkeeperProfileRepository(db);
}

const baseParams = {
  id: 'profile-1',
  userId: 'user-1',
  documentType: 'cedula_ciudadania',
  documentNumber: '123',
  issueDate: new Date('2013-01-01'),
  birthDate: new Date('1995-01-01'),
  documentPhotoAId: 'img-a',
  documentPhotoBId: 'img-b',
  heightCm: 185,
  weightKg: 78,
  cityId: 'city-envigado',
  zoneIds: ['zone-bello', 'zone-copacabana'],
  activatedAt: new Date('2026-08-30T00:00:00.000Z'),
};

describe('GoalkeeperProfileRepository (mocked driver)', () => {
  it('maps a GoalkeeperProfile to its document shape on add', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'profile-1' });
    const repository = repositoryWith(collection);

    await repository.add(new GoalkeeperProfile(baseParams));

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc).toMatchObject({
      _id: 'profile-1',
      userId: 'user-1',
      documentNumber: '123',
      cityId: 'city-envigado',
      zoneIds: ['zone-bello', 'zone-copacabana'],
    });
  });

  it('round-trips a document back into a GoalkeeperProfile', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({
      _id: 'profile-2',
      userId: 'user-2',
      documentType: 'pasaporte',
      documentNumber: '999',
      issueDate: '2020-01-01T00:00:00.000Z',
      birthDate: '1990-01-01T00:00:00.000Z',
      documentPhotoAId: 'img-c',
      documentPhotoBId: 'img-d',
      heightCm: 170,
      weightKg: 65,
      cityId: 'city-bogota',
      zoneIds: ['zone-chapinero'],
      activatedAt: '2026-08-30T00:00:00.000Z',
    });
    const repository = repositoryWith(collection);

    const found = await repository.getByUserId('user-2');

    expect(found?.documentType).toBe('pasaporte');
    expect(found?.cityId).toBe('city-bogota');
    expect(found?.zoneIds).toEqual(['zone-chapinero']);
  });

  describe('targeted updates', () => {
    const storedDoc = {
      _id: 'profile-1',
      userId: 'user-1',
      documentType: 'cedula_ciudadania',
      documentNumber: '123',
      issueDate: '2013-01-01T00:00:00.000Z',
      birthDate: '1995-01-01T00:00:00.000Z',
      documentPhotoAId: 'img-a',
      documentPhotoBId: 'img-b',
      heightCm: 190,
      weightKg: 78,
      cityId: 'city-envigado',
      zoneIds: ['zone-bello'],
      activatedAt: '2026-08-30T00:00:00.000Z',
    };

    it('$sets only the height when only the height is given, so a concurrent weight/availability write is not overwritten', async () => {
      const collection = createFakeCollection();
      collection.findOneAndUpdate.mockResolvedValue(storedDoc);
      const repository = repositoryWith(collection);

      const updated = await repository.updatePhysicalData('user-1', { heightCm: 190 });

      expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user-1' },
        { $set: { heightCm: 190 } },
        { returnDocument: 'after' },
      );
      expect(collection.replaceOne).not.toHaveBeenCalled();
      expect(updated?.heightCm).toBe(190);
    });

    it('$sets only the weight when only the weight is given', async () => {
      const collection = createFakeCollection();
      collection.findOneAndUpdate.mockResolvedValue({ ...storedDoc, weightKg: 82 });
      const repository = repositoryWith(collection);

      await repository.updatePhysicalData('user-1', { weightKg: 82 });

      expect(collection.findOneAndUpdate.mock.calls[0]![1]).toEqual({ $set: { weightKg: 82 } });
    });

    it('$sets both physical fields when both are given', async () => {
      const collection = createFakeCollection();
      collection.findOneAndUpdate.mockResolvedValue(storedDoc);
      const repository = repositoryWith(collection);

      await repository.updatePhysicalData('user-1', { heightCm: 190, weightKg: 82 });

      expect(collection.findOneAndUpdate.mock.calls[0]![1]).toEqual({ $set: { heightCm: 190, weightKg: 82 } });
    });

    it('does not send an empty $set (MongoDB rejects it) — it just reads the profile back', async () => {
      const collection = createFakeCollection();
      collection.findOne.mockResolvedValue(storedDoc);
      const repository = repositoryWith(collection);

      const result = await repository.updatePhysicalData('user-1', {});

      expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result?.userId).toBe('user-1');
    });

    it('$sets cityId and zoneIds together, in a single write, and nothing else', async () => {
      const collection = createFakeCollection();
      collection.findOneAndUpdate.mockResolvedValue({ ...storedDoc, cityId: 'city-medellin', zoneIds: ['zone-bello', 'zone-copacabana'] });
      const repository = repositoryWith(collection);

      const updated = await repository.updateAvailability('user-1', 'city-medellin', ['zone-bello', 'zone-copacabana']);

      expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user-1' },
        { $set: { cityId: 'city-medellin', zoneIds: ['zone-bello', 'zone-copacabana'] } },
        { returnDocument: 'after' },
      );
      expect(updated?.cityId).toBe('city-medellin');
      expect(updated?.zoneIds).toEqual(['zone-bello', 'zone-copacabana']);
    });

    it('returns null, creating nothing, when the user has no profile', async () => {
      const collection = createFakeCollection();
      collection.findOneAndUpdate.mockResolvedValue(null);
      const repository = repositoryWith(collection);

      expect(await repository.updatePhysicalData('nobody', { heightCm: 190 })).toBeNull();
      expect(await repository.updateAvailability('nobody', 'city-medellin', ['zone-bello'])).toBeNull();
      expect(collection.insertOne).not.toHaveBeenCalled();
    });
  });
});
