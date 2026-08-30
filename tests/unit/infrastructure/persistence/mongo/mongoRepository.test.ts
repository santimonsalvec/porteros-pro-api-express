import { describe, expect, it } from 'vitest';
import type { Collection, Document } from 'mongodb';
import { TestFixtureEntity, TestFixtureRepository } from '../../../../fixtures/testFixtureEntity.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

describe('MongoRepository (generic CRUD, mocked driver)', () => {
  it('getAll() maps every document returned by find({})', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ _id: 'a', label: 'A' }, { _id: 'b', label: 'B' }]));
    const repository = new TestFixtureRepository(collection as unknown as Collection<Document>);

    const all = await repository.getAll();

    expect(collection.find).toHaveBeenCalledWith({});
    expect(all.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('getById() maps the document returned by findOne, or null', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValueOnce({ _id: 'a', label: 'A' }).mockResolvedValueOnce(null);
    const repository = new TestFixtureRepository(collection as unknown as Collection<Document>);

    const found = await repository.getById('a');
    const missing = await repository.getById('z');

    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'a' });
    expect(found?.label).toBe('A');
    expect(missing).toBeNull();
  });

  it('add() inserts the mapped document', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'a' });
    const repository = new TestFixtureRepository(collection as unknown as Collection<Document>);

    await repository.add(new TestFixtureEntity('a', 'A'));

    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'a', label: 'A' });
  });

  it('update() replaces the document matched by id', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    const repository = new TestFixtureRepository(collection as unknown as Collection<Document>);

    await repository.update(new TestFixtureEntity('a', 'Updated'));

    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'a' }, { _id: 'a', label: 'Updated' });
  });

  it('delete() removes the document matched by id', async () => {
    const collection = createFakeCollection();
    collection.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const repository = new TestFixtureRepository(collection as unknown as Collection<Document>);

    await repository.delete('a');

    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: 'a' });
  });

  it('propagates a driver failure to the caller immediately, with no retry', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockRejectedValue(new Error('connection lost'));
    const repository = new TestFixtureRepository(collection as unknown as Collection<Document>);

    await expect(repository.getById('a')).rejects.toThrow('connection lost');
    expect(collection.findOne).toHaveBeenCalledTimes(1);
  });
});
