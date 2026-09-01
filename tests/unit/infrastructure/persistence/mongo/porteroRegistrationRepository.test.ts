import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { PorteroRegistrationRepository } from '../../../../../src/infrastructure/persistence/mongo/porteroRegistrationRepository.js';
import { PorteroRegistration } from '../../../../../src/domain/porteros/porteroRegistration.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new PorteroRegistrationRepository(db);
}

describe('PorteroRegistrationRepository (mocked driver)', () => {
  it('omits null section fields entirely on add, so the sparse unique index truly excludes them', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'reg-1' });
    const repository = repositoryWith(collection);

    await repository.add(PorteroRegistration.createEmpty('reg-1', 'user-1'));

    const doc = collection.insertOne.mock.calls[0]![0] as Record<string, unknown>;
    expect(doc._id).toBe('reg-1');
    expect(doc.userId).toBe('user-1');
    expect(doc.identification).toEqual({});
    expect(doc.activatedAt).toBeUndefined();
  });

  it('round-trips a document with partial section data back into a PorteroRegistration', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({
      _id: 'reg-2',
      userId: 'user-2',
      status: 'in_progress',
      identification: { documentType: 'cedula_ciudadania', documentNumber: '123' },
      physicalData: { heightCm: 185 },
      location: {},
      availability: {},
      createdAt: '2026-08-30T15:04:05.000Z',
      updatedAt: '2026-08-30T15:04:05.000Z',
    });
    const repository = repositoryWith(collection);

    const found = await repository.getById('reg-2');

    expect(found?.identification.documentType).toBe('cedula_ciudadania');
    expect(found?.identification.documentNumber).toBe('123');
    expect(found?.identification.birthDate).toBeNull();
    expect(found?.physicalData.heightCm).toBe(185);
    expect(found?.physicalData.weightKg).toBeNull();
    expect(found?.activatedAt).toBeNull();
  });

  it('queries existsByDocument by the document type/number pair, excluding the caller when asked', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = repositoryWith(collection);

    await repository.existsByDocument('cedula_ciudadania', '123', 'user-1');

    expect(collection.findOne).toHaveBeenCalledWith({
      'identification.documentType': 'cedula_ciudadania',
      'identification.documentNumber': '123',
      userId: { $ne: 'user-1' },
    });
  });

  it('ensureIndexes creates the userId-unique and sparse identification-uniqueness indexes', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ userId: 1 }, expect.objectContaining({ unique: true }));
    expect(collection.createIndex).toHaveBeenCalledWith(
      { 'identification.documentType': 1, 'identification.documentNumber': 1 },
      expect.objectContaining({ unique: true, sparse: true }),
    );
  });
});
