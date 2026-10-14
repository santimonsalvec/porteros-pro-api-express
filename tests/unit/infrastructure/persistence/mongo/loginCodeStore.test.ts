import { describe, expect, it } from 'vitest';
import type { Db, Document } from 'mongodb';
import { issueLoginCode } from '../../../../../src/domain/auth/loginCode.js';
import { MongoLoginCodeStore } from '../../../../../src/infrastructure/persistence/mongo/loginCodeStore.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-14T15:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function storeWith(collection: ReturnType<typeof createFakeCollection>) {
  const names: string[] = [];
  const db = { collection: (name: string) => (names.push(name), collection) } as unknown as Db;
  return { store: new MongoLoginCodeStore(db), names };
}

const state = issueLoginCode(null, { audience: 'app', email: 'juana@gmail.com', codeId: 'code-1', codeHash: 'hash-1', expiryMinutes: 2, now: NOW });
const stored = (): Document => {
  const { id, ...rest } = state;
  return { _id: id, ...rest };
};

describe('MongoLoginCodeStore (admin spec 009, research §3)', () => {
  it('lives in loginCodes and reads one document per product and address', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(stored());
    const { store, names } = storeWith(collection);

    expect(await store.get('app', 'juana@gmail.com')).toEqual(state);
    expect(names).toEqual(['loginCodes']);
    expect(collection.findOne).toHaveBeenCalledWith({ _id: 'app:juana@gmail.com' });
  });

  it('answers null when the address never asked', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    expect(await storeWith(collection).store.get('admin', 'ana@porteros.pro')).toBeNull();
  });

  it('inserts the first code, and reports a race as a conflict', async () => {
    const collection = createFakeCollection();
    collection.insertOne.mockResolvedValueOnce({ acknowledged: true }).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    const { store } = storeWith(collection);

    expect(await store.insert(state)).toBe('saved');
    expect(collection.insertOne).toHaveBeenCalledWith(stored());
    expect(await store.insert(state)).toBe('conflict');
  });

  it('lets other insert errors through', async () => {
    const collection = createFakeCollection();
    const error = new Error('network');
    collection.insertOne.mockRejectedValue(error);

    await expect(storeWith(collection).store.insert(state)).rejects.toBe(error);
  });

  it('replaces only at the revision it read', async () => {
    const collection = createFakeCollection();
    collection.replaceOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });
    const { store } = storeWith(collection);
    const next = { ...state, revision: 1 };

    expect(await store.replaceAtRevision(next, 0)).toBe('saved');
    expect(collection.replaceOne).toHaveBeenCalledWith({ _id: 'app:juana@gmail.com', revision: 0 }, { ...stored(), revision: 1 });
    expect(await store.replaceAtRevision(next, 0)).toBe('conflict');
  });

  it('consumes a code in one atomic step that only one call can win', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValueOnce(stored()).mockResolvedValueOnce(null);
    const { store } = storeWith(collection);

    expect(await store.consume('app', 'juana@gmail.com', 'hash-1', NOW)).toBe(true);
    expect(await store.consume('app', 'juana@gmail.com', 'hash-1', NOW)).toBe(false);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'app:juana@gmail.com', status: 'active', codeHash: 'hash-1', expiresAt: { $gt: NOW }, failedAttempts: { $lt: 3 } },
      { $set: { status: 'used', purgeAt: new Date(NOW.getTime() + 24 * HOUR) } },
    );
  });

  it('counts a failure on the active code and invalidates it at the third, atomically', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });

    await storeWith(collection).store.recordFailure('app', 'juana@gmail.com', NOW);

    const [filter, pipeline] = collection.updateOne.mock.calls[0]!;
    expect(filter).toEqual({ _id: 'app:juana@gmail.com', status: 'active', expiresAt: { $gt: NOW } });
    expect(pipeline).toEqual([
      {
        $set: {
          failedAttempts: { $add: ['$failedAttempts', 1] },
          status: { $cond: [{ $gte: [{ $add: ['$failedAttempts', 1] }, 3] }, 'invalidated', '$status'] },
          purgeAt: { $cond: [{ $gte: [{ $add: ['$failedAttempts', 1] }, 3] }, new Date(NOW.getTime() + 24 * HOUR), '$purgeAt'] },
        },
      },
    ]);
  });

  it('purges every document at its purgeAt', async () => {
    const collection = createFakeCollection();
    collection.createIndex.mockResolvedValue('ok');

    await storeWith(collection).store.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ purgeAt: 1 }, { name: 'purgeAt_ttl', expireAfterSeconds: 0 });
  });
});
