import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { MongoEventDeliveryLog } from '../../../../../src/infrastructure/persistence/mongo/eventDeliveryLogRepository.js';
import { createFakeCollection } from '../../../../fakes/fakeMongoCollection.js';

const at = new Date('2026-09-28T18:00:00.000Z');
const event: DomainEvent = { id: 'ev-1', type: 'goalkeeper.assigned', version: 1, occurredAt: at, bookingId: 'b-1', requestId: 'r-1', payload: {} };

function harness() {
  const collection = createFakeCollection();
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return { collection, log: new MongoEventDeliveryLog(db) };
}

describe('MongoEventDeliveryLog (mocked driver)', () => {
  it('records one entry keyed by the event id', async () => {
    const { collection, log } = harness();
    collection.insertOne.mockResolvedValue({});

    expect(await log.record(event, at)).toBe('recorded');
    expect(collection.insertOne).toHaveBeenCalledWith({ _id: 'ev-1', type: 'goalkeeper.assigned', bookingId: 'b-1', requestId: 'r-1', receivedAt: at });
  });

  it('reports a duplicate key as a duplicate and rethrows anything else', async () => {
    const { collection, log } = harness();
    collection.insertOne.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    expect(await log.record(event, at)).toBe('duplicate');

    collection.insertOne.mockRejectedValueOnce(new Error('network'));
    await expect(log.record(event, at)).rejects.toThrow('network');
  });
});
