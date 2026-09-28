import { describe, expect, it } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import {
  appendEventsInSession,
  eventToDocument,
  MongoOutboxStore,
} from '../../../../../src/infrastructure/persistence/mongo/outboxStore.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const now = new Date('2026-09-28T18:00:00.000Z');
const event = (id: string): DomainEvent => ({
  id,
  type: 'booking.created',
  version: 1,
  occurredAt: now,
  bookingId: `b-${id}`,
  requestId: 'r-1',
  payload: { zoneId: 'z-1', startsAt: now },
});

function harness() {
  const outbox = createFakeCollection();
  const db = { collection: (name: string) => (name === 'outbox' ? outbox : null) as unknown as Collection<Document> } as unknown as Db;
  return { outbox, db, store: new MongoOutboxStore(db) };
}

describe('outbox (mocked driver)', () => {
  it('inserts events in the caller session, pending, with the 30-second relay lease', async () => {
    const { outbox, db } = harness();
    const session = {} as ClientSession;
    outbox.insertMany.mockResolvedValue({});

    await appendEventsInSession(db, session, [event('e1'), event('e2')], now);

    expect(outbox.insertMany).toHaveBeenCalledWith(
      [
        { ...eventToDocument(event('e1')), status: 'pending', attempts: 0, claimedUntil: new Date('2026-09-28T18:00:30.000Z'), createdAt: now },
        { ...eventToDocument(event('e2')), status: 'pending', attempts: 0, claimedUntil: new Date('2026-09-28T18:00:30.000Z'), createdAt: now },
      ],
      { session },
    );
  });

  it('inserts nothing for no events', async () => {
    const { outbox, db } = harness();

    await appendEventsInSession(db, {} as ClientSession, [], now);

    expect(outbox.insertMany).not.toHaveBeenCalled();
  });

  it('marks events published with their time', async () => {
    const { outbox, store } = harness();
    outbox.updateMany.mockResolvedValue({});

    await store.markPublished(['e1', 'e2'], now);

    expect(outbox.updateMany).toHaveBeenCalledWith({ _id: { $in: ['e1', 'e2'] } }, { $set: { status: 'published', publishedAt: now } });
  });

  it('claims pending events whose lease expired, oldest first, one atomic update each, up to the limit', async () => {
    const { outbox, store } = harness();
    outbox.findOneAndUpdate
      .mockResolvedValueOnce({ ...eventToDocument(event('e1')), status: 'pending' })
      .mockResolvedValueOnce({ ...eventToDocument(event('e2')), status: 'pending' })
      .mockResolvedValueOnce(null);

    const claimed = await store.claimNext(now, 60, 10);

    expect(claimed.map((claimedEvent) => claimedEvent.id)).toEqual(['e1', 'e2']);
    expect(outbox.findOneAndUpdate).toHaveBeenCalledWith(
      { status: 'pending', claimedUntil: { $lte: now } },
      { $set: { claimedUntil: new Date('2026-09-28T18:01:00.000Z') }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
    expect(outbox.findOneAndUpdate).toHaveBeenCalledTimes(3);
  });

  it('stops claiming at the limit', async () => {
    const { outbox, store } = harness();
    outbox.findOneAndUpdate.mockResolvedValue({ ...eventToDocument(event('e1')), status: 'pending' });

    await store.claimNext(now, 60, 2);

    expect(outbox.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('reports the pending count and the oldest', async () => {
    const { outbox, store } = harness();
    outbox.countDocuments.mockResolvedValue(3);
    outbox.findOne.mockResolvedValue({ createdAt: now });

    expect(await store.pendingStats()).toEqual({ count: 3, oldestCreatedAt: now });
    expect(outbox.countDocuments).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('creates the claim index and a 7-day TTL on publishedAt', async () => {
    const { outbox, store } = harness();
    outbox.createIndex.mockResolvedValue('ok');

    await store.ensureIndexes();

    expect(outbox.createIndex).toHaveBeenCalledWith({ status: 1, claimedUntil: 1, createdAt: 1 }, { name: 'status_claimed_created' });
    expect(outbox.createIndex).toHaveBeenCalledWith({ publishedAt: 1 }, { name: 'published_ttl', expireAfterSeconds: 604800 });
  });
});
