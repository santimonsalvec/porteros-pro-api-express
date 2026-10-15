import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { GoalkeeperAdminReader } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperAdminReader.js';
import { createFakeCollection, toArrayCursor, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');

function readerWith(collections: Record<string, FakeMongoCollection>) {
  const db = { collection: (name: string) => (collections[name] ?? createFakeCollection()) as unknown as Collection<Document> } as unknown as Db;
  return new GoalkeeperAdminReader(db);
}

describe('GoalkeeperAdminReader (mocked driver, admin spec 005)', () => {
  it('lists a page of goalkeepers with their balance', async () => {
    const goalkeeperProfiles = createFakeCollection();
    goalkeeperProfiles.aggregate.mockReturnValue(
      toArrayResult([{
        items: [{ _id: 'gp1', userId: 'u1', cityId: 'med', zoneCount: 3, suspendedUntil: NOW, balance: -4000, currency: 'COP', activatedAt: NOW }],
        total: [{ count: 7 }],
      }]),
    );

    const result = await readerWith({ goalkeeperProfiles }).list({ cityId: 'med', now: NOW, page: 1, pageSize: 20 });

    expect(result).toEqual({
      totalItems: 7,
      items: [{ userId: 'u1', cityId: 'med', zoneCount: 3, availableForOffers: true, suspendedUntil: NOW, balance: -4000, currency: 'COP', activatedAt: NOW, vetting: { tier: 'unvalidated', verificationMethod: null, backgroundCheckAlert: null } }],
    });
    expect(goalkeeperProfiles.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { cityId: 'med' } });
  });

  it('answers no goalkeepers when a search found no users, without asking Mongo', async () => {
    const goalkeeperProfiles = createFakeCollection();

    expect(await readerWith({ goalkeeperProfiles }).list({ userIds: [], now: NOW, page: 1, pageSize: 20 })).toEqual({ items: [], totalItems: 0 });
    expect(goalkeeperProfiles.aggregate).not.toHaveBeenCalled();
  });

  it('averages the ratings to one decimal', async () => {
    const ratings = createFakeCollection();
    ratings.aggregate.mockReturnValue(toArrayResult([{ _id: 'u1', average: 4.6333, count: 18 }]));
    const reader = readerWith({ ratings });

    expect(await reader.ratingsFor(['u1', 'u2'])).toEqual(new Map([['u1', { average: 4.6, count: 18 }]]));
    expect(await reader.ratingsFor([])).toEqual(new Map());
    expect(ratings.aggregate).toHaveBeenCalledTimes(1);
  });

  it('counts withdrawals and no-shows', async () => {
    const goalkeeperIncidents = createFakeCollection();
    goalkeeperIncidents.aggregate.mockReturnValue(toArrayResult([{ _id: 'no_show', count: 2 }]));

    expect(await readerWith({ goalkeeperIncidents }).incidentCounts('u1')).toEqual({ withdrawal: 0, no_show: 2 });
    expect(goalkeeperIncidents.aggregate).toHaveBeenCalledWith([{ $match: { goalkeeperId: 'u1' } }, { $group: { _id: '$kind', count: { $sum: 1 } } }]);
  });

  it("lists the goalkeeper's accepted bookings not played yet, soonest first, with the total", async () => {
    const bookings = createFakeCollection();
    const cursor = toArrayCursor([{ _id: 'b1', requestId: 'r1', startsAt: NOW, zoneId: 'z1' }]);
    bookings.find.mockReturnValue(cursor);
    bookings.countDocuments.mockResolvedValue(3);

    const result = await readerWith({ bookings }).upcomingBookings('u1', NOW, 1);

    const filter = { goalkeeperId: 'u1', status: 'assigned', startsAt: { $gt: NOW } };
    expect(bookings.find).toHaveBeenCalledWith(filter, { projection: { _id: 1, requestId: 1, startsAt: 1, zoneId: 1 } });
    expect(cursor.sort).toHaveBeenCalledWith({ startsAt: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(1);
    expect(bookings.countDocuments).toHaveBeenCalledWith(filter);
    expect(result).toEqual({ total: 3, items: [{ id: 'b1', requestId: 'r1', startsAt: NOW, zoneId: 'z1' }] });
  });
});
