import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoOutboxStore } from '../../../../../src/infrastructure/persistence/mongo/outboxStore.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';

const created = new Date('2026-10-13T13:48:02.000Z');

function harness() {
  const outbox = createFakeCollection();
  const db = { collection: () => outbox as unknown as Collection<Document> } as unknown as Db;
  return { outbox, store: new MongoOutboxStore(db) };
}

describe('the outbox for the admin (admin spec 008, research §7)', () => {
  it('lists the pending events oldest first, a page at a time, never their payload', async () => {
    const { outbox, store } = harness();
    const cursor = toArrayCursor([{ _id: 'evt-1', type: 'goalkeeper.assigned', bookingId: 'bk-1', requestId: 'rq-1', createdAt: created, attempts: 15, claimedUntil: created }]);
    outbox.find.mockReturnValue(cursor);
    outbox.countDocuments.mockResolvedValue(37);

    const page = await store.listPending({ retried: false }, 2, 20);

    expect(outbox.find).toHaveBeenCalledWith({ status: 'pending' }, { projection: { type: 1, bookingId: 1, requestId: 1, createdAt: 1, attempts: 1, claimedUntil: 1 } });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(20);
    expect(outbox.countDocuments).toHaveBeenCalledWith({ status: 'pending' });
    expect(page).toEqual({
      items: [{ id: 'evt-1', type: 'goalkeeper.assigned', bookingId: 'bk-1', requestId: 'rq-1', createdAt: created, attempts: 15, claimedUntil: created }],
      totalItems: 37,
    });
  });

  it('keeps only those the sweep tried more than once', async () => {
    const { outbox, store } = harness();
    outbox.find.mockReturnValue(toArrayCursor([]));
    outbox.countDocuments.mockResolvedValue(0);
    await store.listPending({ retried: true }, 1, 20);
    expect(outbox.find.mock.calls[0]![0]).toEqual({ status: 'pending', attempts: { $gte: 2 } });
  });

  it('counts the retried pending events', async () => {
    const { outbox, store } = harness();
    outbox.countDocuments.mockResolvedValue(12);
    expect(await store.retriedCount()).toBe(12);
    expect(outbox.countDocuments).toHaveBeenCalledWith({ status: 'pending', attempts: { $gte: 2 } });
  });

  it('creates the index the list reads', async () => {
    const { outbox, store } = harness();
    await store.ensureIndexes();
    expect(outbox.createIndex).toHaveBeenCalledWith({ status: 1, createdAt: 1, _id: 1 }, { name: 'status_created' });
  });
});
