import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { AccountClosure } from '../../../../../src/domain/accountClosures/accountClosure.js';
import { AccountClosureRepository } from '../../../../../src/infrastructure/persistence/mongo/accountClosureRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-14T15:00:00Z');

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  return new AccountClosureRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db);
}

const closure = () => AccountClosure.request({ id: 'c1', userId: 'u1', role: 'goalkeeper', balanceAtRequest: 13000, currency: 'COP', now: NOW });

describe('AccountClosureRepository (mocked driver, feature 029)', () => {
  it('builds its indexes: one open request per user, the admin list, the history', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();
    expect(collection.createIndex).toHaveBeenCalledWith(
      { userId: 1 },
      { name: 'user_open_unique', unique: true, partialFilterExpression: { status: { $in: ['requested', 'refund_recorded'] } } },
    );
    expect(collection.createIndex).toHaveBeenCalledWith({ status: 1, requestedAt: -1 }, { name: 'status_requested' });
    expect(collection.createIndex).toHaveBeenCalledWith({ userId: 1, requestedAt: -1 }, { name: 'user_requested' });
  });

  it('stores a closure keyed by its id and reads it back whole', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);
    expect(await repository.add(closure())).toBe('added');
    const stored = collection.insertOne.mock.calls[0]![0] as Document;
    expect(stored).toMatchObject({ _id: 'c1', userId: 'u1', role: 'goalkeeper', status: 'requested', balanceAtRequest: 13000, currency: 'COP' });

    collection.findOne.mockResolvedValue(stored);
    expect(await repository.findById('c1')).toEqual(closure());
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'c1' });
  });

  it('says already_open when the unique index refuses a second open request', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
    expect(await repositoryWith(collection).add(closure())).toBe('already_open');
  });

  it('rethrows any other write error', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockRejectedValue(new Error('boom'));
    await expect(repositoryWith(collection).add(closure())).rejects.toThrow('boom');
  });

  it('finds the open, the latest and the closed request of a user', async () => {
    const collection = createFakeCollection();
    const repository = repositoryWith(collection);
    collection.findOne.mockResolvedValue(null);
    expect(await repository.findOpenByUserId('u1')).toBeNull();
    expect(collection.findOne).toHaveBeenLastCalledWith({ userId: 'u1', status: { $in: ['requested', 'refund_recorded'] } });
    await repository.findClosedByUserId('u1');
    expect(collection.findOne).toHaveBeenLastCalledWith({ userId: 'u1', status: 'closed' });
    await repository.findLatestByUserId('u1');
    expect(collection.findOne).toHaveBeenLastCalledWith({ userId: 'u1' }, { sort: { requestedAt: -1 } });
  });

  it('saves only if the stored status is still the one it was read with', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValue({ matchedCount: 1 });
    const repository = repositoryWith(collection);
    expect(await repository.save(closure(), 'requested')).toBe(true);
    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'c1', status: 'requested' }, expect.objectContaining({ _id: 'c1' }));
    collection.replaceOne.mockResolvedValue({ matchedCount: 0 });
    expect(await repository.save(closure(), 'requested')).toBe(false);
  });

  it('lists with its filters, newest first, with the total', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayResult([]);
    collection.find.mockReturnValue(Object.assign(cursor, { sort: () => Object.assign(cursor, { skip: () => Object.assign(cursor, { limit: () => cursor }) }) }));
    collection.countDocuments.mockResolvedValue(7);
    const result = await repositoryWith(collection).list({ statuses: ['requested'], userIds: ['u1', 'u2'], debt: 'with', page: 2, pageSize: 10 });
    expect(collection.find).toHaveBeenCalledWith({ status: { $in: ['requested'] }, userId: { $in: ['u1', 'u2'] }, balanceAtRequest: { $lt: 0 } });
    expect(result.totalItems).toBe(7);
  });

  it('says which users have an open request', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([{ userId: 'u2' }]));
    expect([...(await repositoryWith(collection).openUserIds(['u1', 'u2']))]).toEqual(['u2']);
    expect(collection.find).toHaveBeenCalledWith({ userId: { $in: ['u1', 'u2'] }, status: { $in: ['requested', 'refund_recorded'] } }, { projection: { userId: 1 } });
  });
});
