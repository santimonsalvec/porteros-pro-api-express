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
    expect(collection.createIndex).toHaveBeenCalledWith({ status: 1, zoneId: 1, startsAt: 1, _id: 1 }, { name: 'status_zone_start' });
    expect(collection.createIndex).toHaveBeenCalledWith({ goalkeeperId: 1, startsAt: 1, _id: 1 }, { name: 'goalkeeper_start' });
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
      endsAt: new Date('2026-09-28T21:30:00.000Z'),
      status: 'pending_assignment',
      price: { unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP' },
      commission: 7000,
      travelBufferMinutes: 30,
      searchEndsAt: new Date('2026-09-28T19:30:00.000Z'),
      goalkeeperId: null,
      assignedAt: null,
      createdAt: request.createdAt,
      endedAt: null,
      endReason: null,
      cancelledBy: null,
      cancellationNote: null,
      replacesBookingId: null,
      excludedGoalkeeperIds: [],
      checkIn: null,
      checkInOpenNoticeAt: null,
      checkInLastCallAt: null,
      checkInMissedAt: null,
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

  describe("the goalkeeper's reads (feature 012)", () => {
    const now = new Date('2026-09-27T18:00:00.000Z');

    it('reads available candidates: pending, in the zones, search open, not their own, affordable, soonest first, capped', async () => {
      const collection = createFakeCollection();
      const cursor = toArrayCursor([bookingToDocument(booking!)]);
      collection.find.mockReturnValue(cursor);

      const found = await repositoryWith(collection).findAvailableCandidates({
        zoneIds: ['zone-cali-norte'],
        excludeClientId: 'gk-1',
        maxCommission: 13000,
        now,
        cap: 1000,
      });

      expect(collection.find).toHaveBeenCalledWith({
        status: 'pending_assignment',
        zoneId: { $in: ['zone-cali-norte'] },
        searchEndsAt: { $gt: now },
        clientId: { $ne: 'gk-1' },
        commission: { $lte: 13000 },
      });
      expect(cursor.sort).toHaveBeenCalledWith({ startsAt: 1, _id: 1 });
      expect(cursor.limit).toHaveBeenCalledWith(1000);
      expect(found).toEqual([booking]);
    });

    it('reads no candidates for a goalkeeper without zones', async () => {
      const collection = createFakeCollection();

      expect(
        await repositoryWith(collection).findAvailableCandidates({ zoneIds: [], excludeClientId: 'gk-1', maxCommission: 1, now, cap: 10 }),
      ).toEqual([]);
      expect(collection.find).not.toHaveBeenCalled();
    });

    it("reads the goalkeeper's assigned bookings and one booking by id", async () => {
      const collection = createFakeCollection();
      collection.find.mockReturnValue(toArrayCursor([]));
      collection.findOne.mockResolvedValue(bookingToDocument(booking!));

      await repositoryWith(collection).findAssignedToGoalkeeper('gk-1');
      const found = await repositoryWith(collection).findById('r-1-b1');

      expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: 'gk-1', status: 'assigned' });
      expect(collection.findOne).toHaveBeenCalledWith({ _id: 'r-1-b1' });
      expect(found).toEqual(booking);
    });

    it('pages the agenda: upcoming soonest first, past most recent first', async () => {
      const collection = createFakeCollection();
      collection.countDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      const upcoming = toArrayCursor([]);
      const past = toArrayCursor([]);
      collection.find.mockReturnValueOnce(upcoming).mockReturnValueOnce(past);
      const repository = repositoryWith(collection);

      expect(await repository.countForGoalkeeper('gk-1', now)).toEqual({ upcoming: 2, past: 1 });
      await repository.findUpcomingForGoalkeeper('gk-1', now, 0, 20);
      await repository.findPastForGoalkeeper('gk-1', now, 5, 20);

      expect(collection.countDocuments).toHaveBeenNthCalledWith(1, { goalkeeperId: 'gk-1', startsAt: { $gte: now } });
      expect(collection.find).toHaveBeenNthCalledWith(1, { goalkeeperId: 'gk-1', startsAt: { $gte: now } });
      expect(upcoming.sort).toHaveBeenCalledWith({ startsAt: 1, _id: 1 });
      expect(collection.find).toHaveBeenNthCalledWith(2, { goalkeeperId: 'gk-1', startsAt: { $lt: now } });
      expect(past.sort).toHaveBeenCalledWith({ startsAt: -1, _id: -1 });
      expect(past.skip).toHaveBeenCalledWith(5);
    });
  });
});
