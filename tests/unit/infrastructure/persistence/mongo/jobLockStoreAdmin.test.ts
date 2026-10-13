import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoJobLockStore } from '../../../../../src/infrastructure/persistence/mongo/jobLockStore.js';
import { createFakeCollection, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

describe('the job leases for the admin (admin spec 008, research §8)', () => {
  it("reads each named job's last start and lease, and nothing for one that never ran, without writing", async () => {
    const locks = createFakeCollection();
    const db = { collection: () => locks as unknown as Collection<Document> } as unknown as Db;
    const lockedAt = new Date('2026-10-13T14:01:00.000Z');
    const lockedUntil = new Date('2026-10-13T14:01:55.000Z');
    locks.find.mockReturnValue(toArrayResult([{ _id: 'booking-expiry', lockedAt, lockedUntil }]));

    const found = await new MongoJobLockStore(db).list(['booking-expiry', 'invoicing-issuer']);

    expect(locks.find).toHaveBeenCalledWith({ _id: { $in: ['booking-expiry', 'invoicing-issuer'] } });
    expect(found).toEqual(new Map([['booking-expiry', { lockedAt, lockedUntil }]]));
    expect(locks.updateOne).not.toHaveBeenCalled();
    expect(locks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
