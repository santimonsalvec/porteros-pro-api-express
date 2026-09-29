import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { BookingRepository } from '../../../../../src/infrastructure/persistence/mongo/bookingRepository.js';
import { GoalkeeperProfileRepository } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperProfileRepository.js';
import { WalletRepository } from '../../../../../src/infrastructure/persistence/mongo/walletRepository.js';
import { GoalkeeperRequestRepository, requestToDocument } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperRequestRepository.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';
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

  it('reads the bookings whose search ended, oldest deadline first (feature 016)', async () => {
    const collection = createFakeCollection();
    const cursor = toArrayCursor([]);
    collection.find.mockReturnValue(cursor);

    await new BookingRepository(dbOf(collection)).findDueForExpiry(now, 500);

    expect(collection.find).toHaveBeenCalledWith({ status: 'pending_assignment', searchEndsAt: { $lte: now } });
    expect(cursor.sort).toHaveBeenCalledWith({ searchEndsAt: 1, _id: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(500);
  });

  it('reads the "cancel all" requests due for evaluation, each by its own free-cancellation period', async () => {
    const collection = createFakeCollection();
    const due = buildRequest('due', new Date('2026-10-04T18:59:00.000Z'), { partialFulfillment: 'cancel_all' });
    const notYet = buildRequest('not-yet', new Date('2026-10-04T19:30:00.000Z'), { partialFulfillment: 'cancel_all' });
    collection.find.mockReturnValue(toArrayCursor([requestToDocument(due), requestToDocument(notYet)]));

    const found = await new GoalkeeperRequestRepository(dbOf(collection)).findDueForCancelAll(now, 10);

    expect(collection.find).toHaveBeenCalledWith({
      partialFulfillment: 'cancel_all',
      active: true,
      cancelAllEvaluatedAt: null,
      startsAt: { $lte: new Date('2026-10-05T18:00:00.000Z') },
    });
    expect(found.map((request) => request.id)).toEqual(['due']);
  });

  it('creates the cancelAll_due index', async () => {
    const collection = createFakeCollection();
    await new GoalkeeperRequestRepository(dbOf(collection)).ensureIndexes();
    expect(collection.createIndex).toHaveBeenCalledWith({ partialFulfillment: 1, cancelAllEvaluatedAt: 1, startsAt: 1 }, { name: 'cancelAll_due' });
  });

  it('reads the requests whose contacts became visible and were not announced, not started (feature 019)', async () => {
    const collection = createFakeCollection();
    // now is 2026-10-04T18:00Z: visible from start − 60.
    const due = buildRequest('due', new Date('2026-10-04T18:59:00.000Z'));
    const notYet = buildRequest('not-yet', new Date('2026-10-04T19:30:00.000Z'));
    collection.find.mockReturnValue(toArrayCursor([requestToDocument(due), requestToDocument(notYet)]));

    const found = await new GoalkeeperRequestRepository(dbOf(collection)).findDueForContactsReveal(now, 10);

    expect(collection.find).toHaveBeenCalledWith({
      active: true,
      contactsRevealedAt: null,
      startsAt: { $gt: now, $lte: new Date('2026-10-05T18:00:00.000Z') },
    });
    expect(found.map((request) => request.id)).toEqual(['due']);
  });

  it('marks a request revealed once, and creates the contactsReveal_due index', async () => {
    const collection = createFakeCollection();
    collection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 0 });
    const repository = new GoalkeeperRequestRepository(dbOf(collection));

    expect(await repository.markContactsRevealed('r-1', now)).toBe(true);
    expect(await repository.markContactsRevealed('r-1', now)).toBe(false);
    expect(collection.updateOne).toHaveBeenCalledWith({ _id: 'r-1', contactsRevealedAt: null }, { $set: { contactsRevealedAt: now } });
    await repository.ensureIndexes();
    expect(collection.createIndex).toHaveBeenCalledWith({ contactsRevealedAt: 1, startsAt: 1 }, { name: 'contactsReveal_due' });
  });
});

