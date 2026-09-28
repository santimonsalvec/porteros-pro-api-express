import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { BookingRepository } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { GoalkeeperProfileRepository } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperProfileRepository.js';
import { WalletRepository } from '../../../../../src/infrastructure/persistence/mongo/walletRepository.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

/** The reads feature 015 adds to existing repositories (research §2, §3, §8). */
function dbOf(collection: ReturnType<typeof createFakeCollection>): Db {
  return { collection: () => collection as unknown as Collection<Document> } as unknown as Db;
}

const now = new Date('2026-10-04T18:00:00.000Z');

describe('feature 015 reads on existing repositories (mocked driver)', () => {
  it('finds offer candidates by zone, treating a missing switch as on', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = new GoalkeeperProfileRepository(dbOf(collection));

    expect(await repository.findOfferCandidates([])).toEqual([]);
    expect(collection.find).not.toHaveBeenCalled();
    await repository.findOfferCandidates(['zone-bello']);
    expect(collection.find).toHaveBeenCalledWith({ zoneIds: { $in: ['zone-bello'] }, availableForOffers: { $ne: false } });
  });

  it('sets the switch and reports the value before (absent means on)', async () => {
    const collection = createFakeCollection();
    const repository = new GoalkeeperProfileRepository(dbOf(collection));
    collection.findOneAndUpdate.mockResolvedValueOnce({ userId: 'u' }).mockResolvedValueOnce({ availableForOffers: false }).mockResolvedValueOnce(null);

    expect(await repository.setAvailableForOffers('u', false)).toEqual({ previous: true });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith({ userId: 'u' }, { $set: { availableForOffers: false } }, { returnDocument: 'before' });
    expect(await repository.setAvailableForOffers('u', true)).toEqual({ previous: false });
    expect(await repository.setAvailableForOffers('missing', true)).toBeNull();
  });

  it('reads a stored profile without the switch as available, and writes it', async () => {
    const collection = createFakeCollection();
    const repository = new GoalkeeperProfileRepository(dbOf(collection));
    collection.findOne.mockResolvedValue({
      _id: 'p',
      userId: 'u',
      issueDate: now,
      birthDate: now,
      activatedAt: now,
      zoneIds: ['zone-bello'],
    });

    expect((await repository.getByUserId('u'))?.availableForOffers).toBe(true);
    collection.findOne.mockResolvedValue({ _id: 'p', userId: 'u', issueDate: now, birthDate: now, activatedAt: now, availableForOffers: false });
    expect((await repository.getByUserId('u'))?.availableForOffers).toBe(false);
  });

  it('creates the zone_offers and status_searchEnds indexes', async () => {
    const profiles = createFakeCollection();
    await new GoalkeeperProfileRepository(dbOf(profiles)).ensureIndexes();
    expect(profiles.createIndex).toHaveBeenCalledWith({ zoneIds: 1, availableForOffers: 1 }, { name: 'zone_offers' });

    const bookings = createFakeCollection();
    bookings.dropIndex.mockResolvedValue(undefined);
    await new BookingRepository(dbOf(bookings)).ensureIndexes();
    expect(bookings.createIndex).toHaveBeenCalledWith({ status: 1, searchEndsAt: 1 }, { name: 'status_searchEnds' });
  });

  it('reads the open pending bookings, soonest first, capped', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([]);
    collection.find.mockReturnValue(cursor);

    await new BookingRepository(dbOf(collection)).findOpenPending(now, 2000);

    expect(collection.find).toHaveBeenCalledWith({ status: 'pending_assignment', searchEndsAt: { $gt: now } });
    expect(cursor.sort).toHaveBeenCalledWith({ startsAt: 1, _id: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(2000);
  });

  it('reads the assigned bookings of several goalkeepers in one query', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = new BookingRepository(dbOf(collection));

    expect(await repository.findAssignedToGoalkeepers([])).toEqual([]);
    await repository.findAssignedToGoalkeepers(['g1', 'g2']);
    expect(collection.find).toHaveBeenCalledWith({ goalkeeperId: { $in: ['g1', 'g2'] }, status: 'assigned' });
  });

  it('reads the wallets of several goalkeepers in one query', async () => {
    const collection = createFakeCollection();
    collection.find.mockReturnValue(toArrayResult([]));
    const repository = new WalletRepository(dbOf(collection));

    expect(await repository.findByGoalkeeperIds([])).toEqual([]);
    await repository.findByGoalkeeperIds(['g1']);
    expect(collection.find).toHaveBeenCalledWith({ _id: { $in: ['g1'] } });
  });
});
