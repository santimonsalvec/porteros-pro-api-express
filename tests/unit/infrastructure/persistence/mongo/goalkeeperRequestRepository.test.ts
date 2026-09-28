import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import {
  GoalkeeperRequestRepository,
  requestFromDocument,
  requestToDocument,
} from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new GoalkeeperRequestRepository(db);
}

const startsAt = new Date('2026-09-28T20:00:00.000Z');
const request = buildRequest('r-1', startsAt, { partialFulfillment: 'cancel_all', freeCancellationMinutes: 45 });

describe('GoalkeeperRequestRepository (mocked driver)', () => {
  it('creates the one-request-per-quote, one-active-request-per-match and list indexes', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.createIndex).toHaveBeenCalledWith({ quoteId: 1 }, { name: 'quoteId_unique', unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith(
      { clientId: 1, zoneId: 1, startsAt: 1 },
      { name: 'client_zone_start_active_unique', unique: true, partialFilterExpression: { active: true } },
    );
    expect(collection.createIndex).toHaveBeenCalledWith({ clientId: 1, startsAt: 1, _id: 1 }, { name: 'client_startsAt' });
  });

  it('stores zone and start at the top level as well, with dates as Dates, and maps back', () => {
    const doc = requestToDocument(request);

    expect(doc).toMatchObject({
      _id: 'r-1',
      clientId: 'client-a',
      quoteId: 'quote-r-1',
      zoneId: 'zone-cali-norte',
      goalkeeperCount: 2,
      partialFulfillment: 'cancel_all',
      freeCancellationMinutes: 45,
      active: true,
    });
    expect(doc.startsAt).toBeInstanceOf(Date);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(requestFromDocument(doc)).toEqual(request);
  });

  it('finds the request of a quote for its client', async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(requestToDocument(request));

    const found = await repositoryWith(collection).findByQuoteForClient('quote-r-1', 'client-a');

    expect(collection.findOne).toHaveBeenCalledWith({ quoteId: 'quote-r-1', clientId: 'client-a' });
    expect(found).toEqual(request);
  });

  it("finds only the client's ACTIVE request for a zone and start", async () => {
    const collection = createFakeCollection();
    collection.findOne.mockResolvedValue(null);

    const found = await repositoryWith(collection).findActiveByMatchForClient('client-a', 'zone-cali-norte', startsAt);

    expect(collection.findOne).toHaveBeenCalledWith({ clientId: 'client-a', zoneId: 'zone-cali-norte', startsAt, active: true });
    expect(found).toBeNull();
  });

  describe("the client's list", () => {
    const now = new Date('2026-09-21T18:00:00.000Z');

    it('counts both segments with the same instant', async () => {
      const collection = createFakeCollection();
      collection.countDocuments.mockResolvedValueOnce(3).mockResolvedValueOnce(42);

      const counts = await repositoryWith(collection).countForClient('client-a', now);

      expect(collection.countDocuments).toHaveBeenNthCalledWith(1, { clientId: 'client-a', startsAt: { $gte: now } });
      expect(collection.countDocuments).toHaveBeenNthCalledWith(2, { clientId: 'client-a', startsAt: { $lt: now } });
      expect(counts).toEqual({ upcoming: 3, past: 42 });
    });

    it('reads upcoming requests soonest first, id as tie-breaker', async () => {
      const collection = createFakeCollection();
      const cursor = toArrayCursor([requestToDocument(request)]);
      collection.find.mockReturnValue(cursor);

      const found = await repositoryWith(collection).findUpcomingForClient('client-a', now, 20, 5);

      expect(collection.find).toHaveBeenCalledWith({ clientId: 'client-a', startsAt: { $gte: now } });
      expect(cursor.sort).toHaveBeenCalledWith({ startsAt: 1, _id: 1 });
      expect(cursor.skip).toHaveBeenCalledWith(20);
      expect(cursor.limit).toHaveBeenCalledWith(5);
      expect(found).toEqual([request]);
    });

    it('reads past requests most recent first, id descending as tie-breaker', async () => {
      const collection = createFakeCollection();
      const cursor = toArrayCursor([requestToDocument(request)]);
      collection.find.mockReturnValue(cursor);

      const found = await repositoryWith(collection).findPastForClient('client-a', now, 17, 20);

      expect(collection.find).toHaveBeenCalledWith({ clientId: 'client-a', startsAt: { $lt: now } });
      expect(cursor.sort).toHaveBeenCalledWith({ startsAt: -1, _id: -1 });
      expect(cursor.skip).toHaveBeenCalledWith(17);
      expect(cursor.limit).toHaveBeenCalledWith(20);
      expect(found).toEqual([request]);
    });
  });

  it('stores the fixed commission and travel margin, and reads several requests by id', async () => {
    const doc = requestToDocument(buildRequest('r-9', startsAt, { commission: 9000, travelBufferMinutes: 45 }));
    expect(doc).toMatchObject({ commission: 9000, travelBufferMinutes: 45 });

    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayCursor([doc]));
    const found = await repositoryWith(collection).findByIds(['r-9', 'r-x']);

    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['r-9', 'r-x'] } });
    expect(found[0]).toMatchObject({ id: 'r-9', commission: 9000, travelBufferMinutes: 45 });
    expect(await repositoryWith(createFakeCollection()).findByIds([])).toEqual([]);
  });
});
