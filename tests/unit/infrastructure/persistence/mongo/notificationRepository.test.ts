import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoNotificationRepository } from '../../../../../src/infrastructure/persistence/mongo/notificationRepository.js';
import { MongoOfferPushStateStore } from '../../../../../src/infrastructure/persistence/mongo/offerPushStateStore.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const now = new Date('2026-10-04T18:00:00.000Z');
const ID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

function harness() {
  const collection = createFakeCollection();
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return { collection, repository: new MongoNotificationRepository(db), pushState: new MongoOfferPushStateStore(db) };
}

const offer = { id: ID, userId: 'g1', requestId: 'r1', title: 't', body: 'b', data: { type: 'booking.available' }, createdAt: now };

describe('MongoNotificationRepository (mocked driver)', () => {
  it('creates the inbox indexes: listing, one offer per user and request, 90-day TTL', async () => {
    const { collection, repository } = harness();

    await repository.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ userId: 1, createdAt: -1 }, { name: 'user_created' });
    expect(collection.createIndex).toHaveBeenCalledWith(
      { userId: 1, requestId: 1 },
      { name: 'offer_unique', unique: true, partialFilterExpression: { type: 'booking.available' } },
    );
    expect(collection.createIndex).toHaveBeenCalledWith({ createdAt: 1 }, { name: 'created_ttl', expireAfterSeconds: 7_776_000 });
  });

  it('inserts an offer with empty bookkeeping, and reports a duplicate as not created', async () => {
    const { collection, repository } = harness();
    collection.insertOne.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));

    expect(await repository.createOfferIfAbsent(offer)).toBe(true);
    expect(collection.insertOne.mock.calls[0]![0]).toMatchObject({
      _id: ID,
      type: 'booking.available',
      requestId: 'r1',
      readAt: null,
      notifiedAt: null,
      reminderCount: 0,
    });
    expect(await repository.createOfferIfAbsent(offer)).toBe(false);
  });

  it('rethrows other insert errors', async () => {
    const { collection, repository } = harness();
    collection.insertOne.mockRejectedValue(new Error('network'));

    await expect(repository.createOfferIfAbsent(offer)).rejects.toThrow('network');
  });

  it("lists a user's entries newest first and counts the unread ones", async () => {
    const { collection, repository } = harness();
    const cursor = toArrayCursor([{ _id: ID, userId: 'g1', type: 'booking.available', title: 't', body: 'b', createdAt: now, readAt: null }]);
    collection.find.mockReturnValue(cursor);
    collection.countDocuments.mockResolvedValue(1);

    const items = await repository.listForUser('g1', 20, 20);

    expect(collection.find).toHaveBeenCalledWith({ userId: 'g1' });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(items[0]).toMatchObject({ id: ID, data: {}, reminderCount: 0, dismissedAt: null });
    await repository.countUnread('g1');
    expect(collection.countDocuments).toHaveBeenCalledWith({ userId: 'g1', readAt: null });
  });

  it('marks one read only for its owner, keeping an earlier read time', async () => {
    const { collection, repository } = harness();
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 1 }).mockResolvedValueOnce({ matchedCount: 0 });

    expect(await repository.markRead(ID, 'g1', now)).toBe(true);
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: ID, userId: 'g1' }, [{ $set: { readAt: { $ifNull: ['$readAt', now] } } }]);
    expect(await repository.markRead(ID, 'someone-else', now)).toBe(false);
    expect(await repository.markRead('not-a-uuid', 'g1', now)).toBe(false);
    expect(collection.updateOne).toHaveBeenCalledTimes(2);
  });

  it('marks every unread entry of a user read', async () => {
    const { collection, repository } = harness();

    await repository.markAllRead('g1', now);

    expect(collection.updateMany).toHaveBeenCalledWith({ userId: 'g1', readAt: null }, { $set: { readAt: now } });
  });

  it('dismisses only offers, only for their owner', async () => {
    const { collection, repository } = harness();
    collection.findOne
      .mockResolvedValueOnce({ type: 'booking.available' })
      .mockResolvedValueOnce({ type: 'request.goalkeeper_assigned' })
      .mockResolvedValueOnce(null);

    expect(await repository.dismissOffer(ID, 'g1', now)).toBe('dismissed');
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: ID, userId: 'g1' }, [
      { $set: { readAt: { $ifNull: ['$readAt', now] }, dismissedAt: { $ifNull: ['$dismissedAt', now] } } },
    ]);
    expect(await repository.dismissOffer(ID, 'g1', now)).toBe('not_an_offer');
    expect(await repository.dismissOffer(ID, 'g2', now)).toBe('not_found');
    expect(await repository.dismissOffer('bad', 'g1', now)).toBe('not_found');
  });

  it('finds offers of users and requests, and records first pushes and reminders', async () => {
    const { collection, repository } = harness();
    collection.find.mockReturnValue(toArrayResult([]));

    expect(await repository.findOffers([], ['r1'])).toEqual([]);
    await repository.findOffers(['g1'], ['r1']);
    expect(collection.find).toHaveBeenCalledWith({ userId: { $in: ['g1'] }, requestId: { $in: ['r1'] }, type: 'booking.available' });

    await repository.markNotified([ID], now);
    expect(collection.updateMany).toHaveBeenCalledWith({ _id: { $in: [ID] }, notifiedAt: null }, { $set: { notifiedAt: now } });
    await repository.markReminded([ID], now);
    expect(collection.updateMany).toHaveBeenCalledWith({ _id: { $in: [ID] } }, { $inc: { reminderCount: 1 }, $set: { lastRemindedAt: now } });
    await repository.markReminded([], now);
    expect(collection.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('MongoNotificationRepository notices with a dedupe key (feature 016)', () => {
  it('writes a notice once per key and indexes the key uniquely', async () => {
    const { collection, repository } = harness();
    collection.insertOne.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    const notice = { id: ID, userId: 'c1', type: 'request.expired', title: 't', body: 'b', data: { type: 'request.expired', requestId: 'r1' }, createdAt: now, dedupeKey: 'request-outcome:r1' };

    expect(await repository.createIfAbsent(notice)).toBe(true);
    expect(collection.insertOne.mock.calls[0]![0]).toMatchObject({ _id: ID, dedupeKey: 'request-outcome:r1', readAt: null });
    expect(await repository.createIfAbsent(notice)).toBe(false);

    await repository.ensureIndexes();
    expect(collection.createIndex).toHaveBeenCalledWith(
      { dedupeKey: 1 },
      { name: 'dedupe_unique', unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } },
    );
  });
});

describe('MongoOfferPushStateStore (mocked driver)', () => {
  it('claims a goalkeeper only when the last push is older than the interval', async () => {
    const { collection, pushState } = harness();
    collection.findOneAndUpdate.mockResolvedValueOnce(null).mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));

    expect(await pushState.tryClaim('g1', now, 5)).toBe(true);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'g1', lastOfferPushAt: { $lte: new Date('2026-10-04T17:55:00.000Z') } },
      { $set: { lastOfferPushAt: now } },
      { upsert: true },
    );
    expect(await pushState.tryClaim('g1', now, 5)).toBe(false);
  });

  it('rethrows other claim errors, and records unconditional pushes', async () => {
    const { collection, pushState } = harness();
    collection.findOneAndUpdate.mockRejectedValue(new Error('network'));
    await expect(pushState.tryClaim('g1', now, 5)).rejects.toThrow('network');

    await pushState.markPushed(['g1', 'g1', 'g2'], now);
    expect(collection.updateOne).toHaveBeenCalledTimes(2);
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'g1' }, { $set: { lastOfferPushAt: now } }, { upsert: true });
  });
});
