import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { UserBlockRepository } from '../../../../../src/infrastructure/persistence/mongo/userBlockRepository.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const AT = new Date('2026-10-12T15:00:00.000Z');
const STORED = {
  _id: 'u1', blocked: true, blockedAt: AT, blockedBy: 'staff-1', blockReason: 'Acoso',
  unblockedAt: null, unblockedBy: null, unblockReason: null, revision: 3,
};

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  return new UserBlockRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db);
}

describe('UserBlockRepository (mocked driver, admin spec 005)', () => {
  it('reads a block by user, and several at once', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(STORED);
    collection.find.mockReturnValue(toArrayResult([STORED]));
    const repository = repositoryWith(collection);

    expect(await repository.findByUserId('u1')).toEqual({ ...STORED, _id: undefined, userId: 'u1' });
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'u1' });
    expect([...(await repository.findByUserIds(['u1', 'u2'])).keys()]).toEqual(['u1']);
    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['u1', 'u2'] } });
  });

  it('blocks only a user who is not blocked, as one conditional upsert', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValue({ ...STORED, revision: 4 });

    const result = await repositoryWith(collection).block('u1', 'staff-1', 'Acoso', AT);

    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'u1', blocked: { $ne: true } },
      { $set: { blocked: true, blockedAt: AT, blockedBy: 'staff-1', blockReason: 'Acoso' }, $inc: { revision: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    expect(result).toEqual({ outcome: 'changed', record: expect.objectContaining({ userId: 'u1', blocked: true, revision: 4 }) });
  });

  it('answers unchanged when the user already was blocked (the upsert hits the unique id)', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    collection.findOne.mockResolvedValue(STORED);

    expect(await repositoryWith(collection).block('u1', 'staff-2', 'Otra vez', AT)).toEqual({
      outcome: 'unchanged', record: expect.objectContaining({ blockedBy: 'staff-1', blockReason: 'Acoso' }),
    });
  });

  it('unblocks only a blocked user, and otherwise answers unchanged', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValueOnce({ ...STORED, blocked: false, unblockedAt: AT, unblockedBy: 'staff-1', unblockReason: 'Ok' });
    const repository = repositoryWith(collection);

    expect(await repository.unblock('u1', 'staff-1', 'Ok', AT)).toEqual({ outcome: 'changed', record: expect.objectContaining({ blocked: false }) });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'u1', blocked: true },
      { $set: { blocked: false, unblockedAt: AT, unblockedBy: 'staff-1', unblockReason: 'Ok' }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    );

    collection.findOneAndUpdate.mockResolvedValueOnce(null);
    collection.findOne.mockResolvedValue(null);
    expect(await repository.unblock('u9', 'staff-1', 'Ok', AT)).toEqual({ outcome: 'unchanged', record: expect.objectContaining({ userId: 'u9', blocked: false }) });
  });
});
