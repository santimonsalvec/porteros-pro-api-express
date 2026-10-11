import { describe, expect, it } from 'vitest';
import { ObjectId, type Collection, type Db, type Document } from 'mongodb';
import { DocumentTypeRepository } from '../../../../../src/infrastructure/persistence/mongo/documentTypeRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';
import { DocumentType } from '../../../../../src/domain/goalkeepers/documentType.js';

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

describe('DocumentTypeRepository admin methods (spec 003)', () => {
  it('lists by name or code prefix, sorted and paged', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([{ _id: 'cc', code: 'cedula_ciudadania', name: 'Cédula' }]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(1);

    const found = await repositoryWith(collection).list({ q: 'ce', page: 1, pageSize: 20 });

    expect(collection.find).toHaveBeenCalledWith({
      $and: [{ $or: [{ name: { $regex: '^ce', $options: 'i' } }, { code: { $regex: '^ce', $options: 'i' } }] }],
    });
    expect(cursor.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(found.totalItems).toBe(1);
  });

  it('gets one, creates, updates at the revision read and deletes', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue({ _id: 'cc', code: 'cedula_ciudadania', name: 'Cédula', revision: 2 });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const repository = repositoryWith(collection);
    const ti = new DocumentType({ id: 'ti', code: 'tarjeta_identidad', name: 'Tarjeta', revision: 1 });

    expect((await repository.getById('cc'))?.revision).toBe(2);
    await repository.create(ti);
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'ti', code: 'tarjeta_identidad', name: 'Tarjeta', revision: 0 });
    expect(await repository.update(ti)).toBe('saved');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'ti', revision: 1 }, { $set: { code: 'tarjeta_identidad', name: 'Tarjeta' }, $inc: { revision: 1 } });
    expect(await repository.delete('ti')).toBe(true);
  });
});
