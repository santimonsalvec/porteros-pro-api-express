import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db, type Document } from 'mongodb';
import { DocumentTypeRepository } from '../../../../../src/infrastructure/persistence/mongo/documentTypeRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new DocumentTypeRepository(db);
}

describe('DocumentTypeRepository (mocked driver)', () => {
  it('tolerates an ObjectId _id, exposing it as a string', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: new ObjectId(), code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' });
    const repository = repositoryWith(collection);

    const found = await repository.findByCode('cedula_ciudadania');

    expect(typeof found?.id).toBe('string');
    expect(found?.name).toBe('Cédula de ciudadanía');
  });

  it('queries by code', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);
    const repository = repositoryWith(collection);

    await repository.findByCode('unknown_type');

    expect(collection.findOne).toHaveBeenCalledWith({ code: 'unknown_type' });
  });

  it('returns every document via getAll', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(
      toArrayResult([
        { _id: 'dt1', code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' },
        { _id: 'dt2', code: 'pasaporte', name: 'Pasaporte' },
      ]),
    );
    const repository = repositoryWith(collection);

    const all = await repository.getAll();

    expect(all).toHaveLength(2);
  });
});
