import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoJobLockStore } from '../../../../../src/infrastructure/persistence/mongo/jobLockStore.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const now = new Date('2026-09-28T18:00:00.000Z');

function harness() {
  const locks = createFakeCollection();
  const db = { collection: () => locks as unknown as Collection<Document> } as unknown as Db;
  return { locks, store: new MongoJobLockStore(db) };
}

describe('MongoJobLockStore (mocked driver)', () => {
  it('takes an expired or missing lease with an upsert', async () => {
    const { locks, store } = harness();
    locks.findOneAndUpdate.mockResolvedValue(null);

    expect(await store.tryAcquire('expire-bookings', now, 120)).toBe(true);
    expect(locks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'expire-bookings', lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date('2026-09-28T18:02:00.000Z'), lockedAt: now } },
      { upsert: true },
    );
  });

  it('reports a held lease (duplicate key on the upsert) as not acquired', async () => {
    const { locks, store } = harness();
    locks.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    expect(await store.tryAcquire('expire-bookings', now, 120)).toBe(false);
  });

  it('rethrows any other error', async () => {
    const { locks, store } = harness();
    locks.findOneAndUpdate.mockRejectedValue(new Error('network'));

    await expect(store.tryAcquire('job', now, 60)).rejects.toThrow('network');
  });

  it('releases by ending the lease now', async () => {
    const { locks, store } = harness();
    locks.updateOne.mockResolvedValue({});

    await store.release('job', now);

    expect(locks.updateOne).toHaveBeenCalledWith({ _id: 'job' }, { $set: { lockedUntil: now } });
  });
});
