import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoProcessedEventStore } from '../../../../../src/infrastructure/persistence/mongo/processedEventStore.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const at = new Date('2026-09-28T18:00:00.000Z');

function harness() {
  const collection = createFakeCollection();
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return { collection, store: new MongoProcessedEventStore(db) };
}

describe('MongoProcessedEventStore (mocked driver)', () => {
  it('finds a marker by its key', async () => {
    const { collection, store } = harness();
    collection.findOne.mockResolvedValueOnce({ _id: 'c:ev-1' }).mockResolvedValueOnce(null);

    expect(await store.has('c:ev-1')).toBe(true);
    expect(await store.has('c:ev-2')).toBe(false);
  });

  it('inserts the marker with its consumer and event id', async () => {
    const { collection, store } = harness();
    collection.insertOne.mockResolvedValue({});

    await store.markProcessed('delivery-log:ev-1', at);

    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'delivery-log:ev-1', consumer: 'delivery-log', eventId: 'ev-1', processedAt: at });
  });

  it('ignores a concurrent duplicate and rethrows anything else', async () => {
    const { collection, store } = harness();
    collection.insertOne.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    await expect(store.markProcessed('c:ev-1', at)).resolves.toBeUndefined();

    collection.insertOne.mockRejectedValueOnce(new Error('network'));
    await expect(store.markProcessed('c:ev-1', at)).rejects.toThrow('network');
  });

  it('expires markers after 30 days', async () => {
    const { collection, store } = harness();
    collection.createIndex.mockResolvedValue('ok');

    await store.ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ processedAt: 1 }, { name: 'processed_ttl', expireAfterSeconds: 2592000 });
  });
});
