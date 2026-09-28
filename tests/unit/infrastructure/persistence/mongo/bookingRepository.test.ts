import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import {
  BookingRepository,
  bookingFromDocument,
  bookingToDocument,
} from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { createFakeCollection, toArrayCursor } from '../../../../fakes/fakeMongoCollection.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';

function repositoryWith(collection: ReturnType<typeof createFakeCollection>) {
  const db = { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
  return new BookingRepository(db);
}

const request = buildRequest('r-1', new Date('2026-09-28T20:00:00.000Z'));
const [booking] = buildRequestBookings(request);

describe('BookingRepository (mocked driver)', () => {
  it('drops the pre-010 indexes, then creates the requestId index', async () => {
    const collection = createFakeCollection();
    await repositoryWith(collection).ensureIndexes();

    expect(collection.dropIndex.mock.calls.map(([name]) => name)).toEqual([
      'quoteId_unique',
      'client_zone_start_unique',
      'client_startsAt',
    ]);
    expect(collection.createIndex).toHaveBeenCalledWith({ requestId: 1, _id: 1 }, { name: 'requestId' });
  });

  it('tolerates indexes that are already gone', async () => {
    const collection = createFakeCollection();
    collection.dropIndex.mockRejectedValue(Object.assign(new Error('index not found'), { code: 27 }));

    await expect(repositoryWith(collection).ensureIndexes()).resolves.toBeUndefined();
    expect(collection.createIndex).toHaveBeenCalled();
  });

  it('rethrows any other error while dropping an index', async () => {
    const collection = createFakeCollection();
    collection.dropIndex.mockRejectedValue(Object.assign(new Error('not authorized'), { code: 13 }));

    await expect(repositoryWith(collection).ensureIndexes()).rejects.toThrow('not authorized');
  });

  it('stores one goalkeeper per booking with its price, and maps it back', () => {
    const doc = bookingToDocument(booking!);

    expect(doc).toEqual({
      _id: 'r-1-b1',
      requestId: 'r-1',
      clientId: 'client-a',
      zoneId: 'zone-cali-norte',
      startsAt: new Date('2026-09-28T20:00:00.000Z'),
      status: 'pending_assignment',
      price: { unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP' },
      createdAt: request.createdAt,
    });
    expect(bookingFromDocument(doc)).toEqual(booking);
  });

  it('loads the bookings of several requests in request, then booking, order', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([bookingToDocument(booking!)]);
    collection.find.mockReturnValue(cursor);

    const found = await repositoryWith(collection).findByRequestIds(['r-1', 'r-2']);

    expect(collection.find).toHaveBeenCalledWith({ requestId: { $in: ['r-1', 'r-2'] } });
    expect(cursor.sort).toHaveBeenCalledWith({ requestId: 1, _id: 1 });
    expect(found).toEqual([booking]);
  });

  it('does not query for no requests', async () => {
    const collection = createFakeCollection();

    expect(await repositoryWith(collection).findByRequestIds([])).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
  });
});
