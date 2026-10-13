import { describe, expect, it, vi } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { UserAdminReader } from '../../../../../src/infrastructure/persistence/mongo/userAdminReader.js';
import { createFakeCollection, toArrayCursor, toArrayResult, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');

function readerWith(collections: Record<string, FakeMongoCollection>) {
  const db = { collection: (name: string) => (collections[name] ?? createFakeCollection()) as unknown as Collection<Document> } as unknown as Db;
  return new UserAdminReader(db);
}

describe('UserAdminReader (mocked driver, admin spec 005)', () => {
  it('lists a page of users from the pipeline, with its total', async () => {
    const users = createFakeCollection();
    users.aggregate.mockReturnValue(
      toArrayResult([
        {
          items: [{ _id: 'u1', email: 'laura@x.co', firstName: 'Laura', lastName: 'Gómez', countryCallingCode: '+57', created: NOW, isProfileComplete: true, isGoalkeeper: false, blocked: true }],
          total: [{ count: 41 }],
        },
      ]),
    );

    const result = await readerWith({ users }).list({ q: 'laura', page: 1, pageSize: 20 });

    expect(result).toEqual({
      totalItems: 41,
      items: [{
        id: 'u1', firstName: 'Laura', lastName: 'Gómez', displayName: null, email: 'laura@x.co', countryCallingCode: '+57',
        createdAt: NOW, isProfileComplete: true, isGoalkeeper: false, blocked: true,
      }],
    });
    expect(users.aggregate.mock.calls[0]![0][0]).toHaveProperty('$match.$and');
  });

  it('answers an empty page with a total of 0', async () => {
    const users = createFakeCollection();
    users.aggregate.mockReturnValue(toArrayResult([{ items: [], total: [] }]));

    expect(await readerWith({ users }).list({ page: 3, pageSize: 20 })).toEqual({ items: [], totalItems: 0 });
  });

  it('finds the ids of a search, capped', async () => {
    const users = createFakeCollection();
    const cursor = toArrayCursor([{ _id: 'u1' }, { _id: 'u2' }]);
    users.find.mockReturnValue(cursor);

    expect(await readerWith({ users }).findIds('3001234567', 501)).toEqual(['u1', 'u2']);
    expect(users.find).toHaveBeenCalledWith({ normalizedPhoneNumber: { $regex: '3001234567$' } }, { projection: { _id: 1 } });
    expect(cursor.limit).toHaveBeenCalledWith(501);
  });

  it('reads the terms newest first and the devices without their token', async () => {
    const termsAcceptances = createFakeCollection();
    termsAcceptances.find.mockReturnValue(toArrayCursor([{ termsVersion: '2026-08', acceptedAt: NOW }]));
    const devices = createFakeCollection();
    devices.find.mockReturnValue(toArrayCursor([{ platform: 'ios', lastSeenAt: NOW }]));
    const reader = readerWith({ termsAcceptances, devices });

    expect(await reader.terms('u1')).toEqual([{ version: '2026-08', acceptedAt: NOW }]);
    expect(termsAcceptances.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(await reader.devices('u1')).toEqual([{ platform: 'ios', lastSeenAt: NOW }]);
    expect(devices.find).toHaveBeenCalledWith({ userId: 'u1' }, { projection: { _id: 0, platform: 1, lastSeenAt: 1 } });
  });

  it('counts the requests of a client', async () => {
    const goalkeeperRequests = createFakeCollection();
    goalkeeperRequests.countDocuments.mockResolvedValue(4);

    expect(await readerWith({ goalkeeperRequests }).requestCount('u1')).toBe(4);
    expect(goalkeeperRequests.countDocuments).toHaveBeenCalledWith({ clientId: 'u1' });
  });

  it('lists the requests still open and not started, soonest first', async () => {
    const goalkeeperRequests = createFakeCollection();
    goalkeeperRequests.find.mockReturnValue(
      toArrayCursor([
        { _id: 'r1', startsAt: new Date('2026-10-13T00:00:00.000Z'), zoneId: 'z1' },
        { _id: 'r2', startsAt: new Date('2026-10-14T00:00:00.000Z'), zoneId: 'z1' },
        { _id: 'r3', startsAt: new Date('2026-10-15T00:00:00.000Z'), zoneId: 'z2' },
      ]),
    );
    const bookings = createFakeCollection();
    bookings.distinct.mockResolvedValue(['r1', 'r3']);

    const result = await readerWith({ goalkeeperRequests, bookings }).openRequests('u1', NOW, 1);

    expect(goalkeeperRequests.find).toHaveBeenCalledWith({ clientId: 'u1', startsAt: { $gt: NOW } }, { projection: { _id: 1, startsAt: 1, zoneId: 1 } });
    expect(bookings.distinct).toHaveBeenCalledWith('requestId', { requestId: { $in: ['r1', 'r2', 'r3'] }, status: { $in: ['pending_assignment', 'assigned'] } });
    expect(result).toEqual({ total: 2, items: [{ id: 'r1', startsAt: new Date('2026-10-13T00:00:00.000Z'), zoneId: 'z1' }] });
  });

  it('does not ask the bookings when the client has no future request', async () => {
    const goalkeeperRequests = createFakeCollection();
    goalkeeperRequests.find.mockReturnValue(toArrayCursor([]));
    const bookings = createFakeCollection();

    expect(await readerWith({ goalkeeperRequests, bookings }).openRequests('u1', NOW, 20)).toEqual({ total: 0, items: [] });
    expect(bookings.distinct).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
