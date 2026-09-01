import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { PorteroProfileRepository } from '../../../../../src/infrastructure/persistence/mongo/porteroProfileRepository.js';
import { PorteroProfile } from '../../../../../src/domain/porteros/porteroProfile.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new PorteroProfileRepository(db);
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
  latitude: 6.2,
  longitude: -75.5,
  city: 'Medellín',
  state: 'Antioquia',
  country: 'CO',
  neighborhood: null,
  formattedAddress: null,
  radiusKm: 25,
  activatedAt: new Date('2026-08-30T00:00:00.000Z'),
};

describe('PorteroProfileRepository (mocked driver)', () => {
  it('maps a PorteroProfile to its document shape on add', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'profile-1' });
    const repository = repositoryWith(collection);

    await repository.add(new PorteroProfile(baseParams));

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc).toMatchObject({ _id: 'profile-1', userId: 'user-1', documentNumber: '123', radiusKm: 25 });
    expect(doc.neighborhood).toBeUndefined();
  });

  it('round-trips a document back into a PorteroProfile', async () => {
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
      latitude: 4.6,
      longitude: -74.0,
      city: 'Bogotá',
      state: 'Cundinamarca',
      country: 'CO',
      radiusKm: 15,
      activatedAt: '2026-08-30T00:00:00.000Z',
    });
    const repository = repositoryWith(collection);

    const found = await repository.getByUserId('user-2');

    expect(found?.documentType).toBe('pasaporte');
    expect(found?.neighborhood).toBeNull();
    expect(found?.radiusKm).toBe(15);
  });
});
