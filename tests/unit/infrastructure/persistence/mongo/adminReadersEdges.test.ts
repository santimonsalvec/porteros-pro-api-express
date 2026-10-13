import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { UserAdminReader } from '../../../../../src/infrastructure/persistence/mongo/userAdminReader.js';
import { GoalkeeperAdminReader } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperAdminReader.js';
import { UserBlockRepository } from '../../../../../src/infrastructure/persistence/mongo/userBlockRepository.js';
import { MongoGoalkeeperDocumentWriter } from '../../../../../src/infrastructure/persistence/mongo/goalkeeperDocumentWriter.js';
import { createFakeCollection, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const dbOf = (collections: Record<string, FakeMongoCollection>) =>
  ({ collection: (name: string) => (collections[name] ?? createFakeCollection()) as unknown as Collection<Document> }) as unknown as Db;

describe('admin readers with sparse documents (admin spec 005)', () => {
  it('a user list without a result is empty; a too-short search finds no ids', async () => {
    const users = createFakeCollection();
    users.aggregate.mockReturnValue(toArrayResult([]));
    const reader = new UserAdminReader(dbOf({ users }));

    expect(await reader.list({ page: 1, pageSize: 20 })).toEqual({ items: [], totalItems: 0 });
    expect(await reader.findIds('a', 10)).toEqual([]);
    expect(users.find).not.toHaveBeenCalled();
  });

  it('fills the defaults of a sparse user row', async () => {
    const users = createFakeCollection();
    users.aggregate.mockReturnValue(toArrayResult([{ items: [{ _id: 'u1', email: 'a@x.co', created: NOW }], total: [{ count: 1 }] }]));

    expect((await new UserAdminReader(dbOf({ users })).list({ page: 1, pageSize: 20 })).items[0]).toEqual({
      id: 'u1', firstName: null, lastName: null, displayName: null, email: 'a@x.co', countryCallingCode: null, createdAt: NOW,
      isProfileComplete: false, isGoalkeeper: false, blocked: false,
    });
  });

  it('fills the defaults of a sparse goalkeeper row, and of a goalkeeper list without a result', async () => {
    const goalkeeperProfiles = createFakeCollection();
    goalkeeperProfiles.aggregate.mockReturnValueOnce(toArrayResult([{ items: [{ userId: 'g1', availableForOffers: false, activatedAt: NOW }], total: [] }]));
    goalkeeperProfiles.aggregate.mockReturnValueOnce(toArrayResult([]));
    const reader = new GoalkeeperAdminReader(dbOf({ goalkeeperProfiles }));

    expect(await reader.list({ now: NOW, page: 1, pageSize: 20 })).toEqual({
      totalItems: 0,
      items: [{ userId: 'g1', cityId: null, zoneCount: 0, availableForOffers: false, suspendedUntil: null, balance: 0, currency: null, activatedAt: NOW }],
    });
    expect(await reader.list({ now: NOW, page: 1, pageSize: 20 })).toEqual({ items: [], totalItems: 0 });
  });

  it('counts withdrawals, and lists bookings without a zone', async () => {
    const goalkeeperIncidents = createFakeCollection();
    goalkeeperIncidents.aggregate.mockReturnValue(toArrayResult([{ _id: 'withdrawal', count: 3 }]));
    const bookings = createFakeCollection();
    bookings.find.mockReturnValue({ sort: () => ({ limit: () => ({ toArray: async () => [{ _id: 'b1', requestId: 'r1', startsAt: NOW }] }) }) });
    bookings.countDocuments.mockResolvedValue(1);
    const reader = new GoalkeeperAdminReader(dbOf({ goalkeeperIncidents, bookings }));

    expect(await reader.incidentCounts('g1')).toEqual({ withdrawal: 3, no_show: 0 });
    expect((await reader.upcomingBookings('g1', NOW, 5)).items[0]).toMatchObject({ zoneId: null });
  });
});

describe('admin writes that meet an unexpected error', () => {
  it('the block repository rethrows what is not a duplicate, and reads a missing block as none', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockRejectedValue(new Error('down'));
    collection.findOne.mockResolvedValue(null);
    const repository = new UserBlockRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db);

    await expect(repository.block('u1', 's', 'Acoso', NOW)).rejects.toThrow('down');
    expect(await repository.findByUserId('u1')).toBeNull();
  });

  it('a block upsert that returns nothing reads the current state', async () => {
    const collection = createFakeCollection();
    collection.findOneAndUpdate.mockResolvedValue(null);
    collection.findOne.mockResolvedValue({ _id: 'u1', blocked: true });

    expect(await new UserBlockRepository({ collection: () => collection as unknown as Collection<Document> } as unknown as Db).block('u1', 's', 'x', NOW)).toMatchObject({
      outcome: 'unchanged', record: { blocked: true, revision: 0, blockedAt: null },
    });
  });

  it('the document writer rethrows what is neither stale nor a duplicate', async () => {
    const goalkeeperRegistrations = createFakeCollection();
    goalkeeperRegistrations.updateOne.mockRejectedValue(new Error('down'));
    const session = { withTransaction: vi.fn(async (fn: (s: ClientSession) => Promise<unknown>) => fn(session as unknown as ClientSession)), endSession: vi.fn(async () => undefined) };
    const writer = new MongoGoalkeeperDocumentWriter(() => session as unknown as ClientSession, dbOf({ goalkeeperRegistrations }));

    await expect(writer.correct('g1', { documentType: 'CC', documentNumber: '1' }, { documentType: 'CC', documentNumber: '2' })).rejects.toThrow('down');
    expect(session.endSession).toHaveBeenCalled();
  });
});
