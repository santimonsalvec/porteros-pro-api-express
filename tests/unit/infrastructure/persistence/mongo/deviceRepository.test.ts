import { describe, expect, it, vi } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { MongoDeviceRepository } from '../../../../../src/infrastructure/persistence/mongo/deviceRepository.js';
import { tokenHash } from '../../../../../src/infrastructure/push/tokenRef.js';
import { createFakeCollection, toArrayCursor, toArrayResult } from '../../../../fakes/fakeMongoCollection.js';

const now = new Date('2026-09-28T18:00:00.000Z');
const earlier = new Date('2026-09-01T18:00:00.000Z');

function harness(inactivityDays = 60) {
  const devices = createFakeCollection();
  const command = vi.fn().mockResolvedValue({ ok: 1 });
  const db = { collection: () => devices as unknown as Collection<Document>, command } as unknown as Db;
  return { devices, command, repository: new MongoDeviceRepository(db, inactivityDays) };
}

const doc = (token: string, userId: string, lastSeenAt = now) => ({
  _id: tokenHash(token),
  token,
  userId,
  platform: 'android',
  createdAt: earlier,
  lastSeenAt,
});

describe('MongoDeviceRepository (mocked driver)', () => {
  describe('upsert', () => {
    it('upserts by token hash, setting the owner and keeping createdAt', async () => {
      const { devices, repository } = harness();
      devices.findOneAndUpdate.mockResolvedValue(null);

      expect(await repository.upsert('tok-1', 'user-a', 'ios', now)).toEqual({ kind: 'registered' });
      expect(devices.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: tokenHash('tok-1') },
        { $set: { token: 'tok-1', userId: 'user-a', platform: 'ios', lastSeenAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true, returnDocument: 'before' },
      );
    });

    it('tells a refresh from a transfer by the owner before the write', async () => {
      const { devices, repository } = harness();
      devices.findOneAndUpdate.mockResolvedValueOnce(doc('tok-1', 'user-a'));
      expect(await repository.upsert('tok-1', 'user-a', 'android', now)).toEqual({ kind: 'refreshed' });

      devices.findOneAndUpdate.mockResolvedValueOnce(doc('tok-1', 'user-a'));
      expect(await repository.upsert('tok-1', 'user-b', 'android', now)).toEqual({
        kind: 'transferred',
        previousUserId: 'user-a',
      });
    });

    it('retries once when a concurrent first registration won the insert', async () => {
      const { devices, repository } = harness();
      devices.findOneAndUpdate
        .mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }))
        .mockResolvedValueOnce(doc('tok-1', 'user-a'));

      expect(await repository.upsert('tok-1', 'user-a', 'android', now)).toEqual({ kind: 'refreshed' });
      expect(devices.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('rethrows any other error', async () => {
      const { devices, repository } = harness();
      devices.findOneAndUpdate.mockRejectedValue(new Error('network'));

      await expect(repository.upsert('tok-1', 'user-a', 'android', now)).rejects.toThrow('network');
    });
  });

  it('trims a user to their most recently seen devices and returns the removed ones', async () => {
    const { devices, repository } = harness();
    const cursor = toArrayCursor([doc('old-1', 'user-a', earlier)]);
    devices.find.mockReturnValue(cursor);
    devices.deleteMany.mockResolvedValue({ deletedCount: 1 });

    const removed = await repository.trimToLimit('user-a', 10);

    expect(devices.find).toHaveBeenCalledWith({ userId: 'user-a' });
    expect(cursor.sort).toHaveBeenCalledWith({ lastSeenAt: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(10);
    expect(devices.deleteMany).toHaveBeenCalledWith({ _id: { $in: [tokenHash('old-1')] } });
    expect(removed).toEqual([{ token: 'old-1', userId: 'user-a', platform: 'android', lastSeenAt: earlier }]);
  });

  it('does not delete when the user is within the limit', async () => {
    const { devices, repository } = harness();
    devices.find.mockReturnValue(toArrayCursor([]));

    expect(await repository.trimToLimit('user-a', 10)).toEqual([]);
    expect(devices.deleteMany).not.toHaveBeenCalled();
  });

  it('removes a token only for its owner', async () => {
    const { devices, repository } = harness();
    devices.deleteOne.mockResolvedValueOnce({ deletedCount: 1 }).mockResolvedValueOnce({ deletedCount: 0 });

    expect(await repository.removeOwned('tok-1', 'user-a')).toBe(true);
    expect(await repository.removeOwned('tok-1', 'user-b')).toBe(false);
    expect(devices.deleteOne).toHaveBeenLastCalledWith({ _id: tokenHash('tok-1'), userId: 'user-b' });
  });

  it('removes tokens by hash, skipping the query for an empty list', async () => {
    const { devices, repository } = harness();
    devices.deleteMany.mockResolvedValue({ deletedCount: 2 });

    expect(await repository.removeByTokens([])).toBe(0);
    expect(devices.deleteMany).not.toHaveBeenCalled();
    expect(await repository.removeByTokens(['a', 'b'])).toBe(2);
    expect(devices.deleteMany).toHaveBeenCalledWith({ _id: { $in: [tokenHash('a'), tokenHash('b')] } });
  });

  it('finds the devices of a set of users, skipping the query for an empty set', async () => {
    const { devices, repository } = harness();
    devices.find.mockReturnValue(toArrayResult([doc('tok-1', 'user-a')]));

    expect(await repository.findByUserIds([])).toEqual([]);
    expect(devices.find).not.toHaveBeenCalled();
    expect(await repository.findByUserIds(['user-a', 'user-b'])).toEqual([
      { token: 'tok-1', userId: 'user-a', platform: 'android', lastSeenAt: now },
    ]);
    expect(devices.find).toHaveBeenCalledWith({ userId: { $in: ['user-a', 'user-b'] } });
  });

  describe('ensureIndexes', () => {
    it('creates the lookup index and a TTL of inactivityDays in seconds', async () => {
      const { devices, command, repository } = harness(60);
      devices.listIndexes.mockReturnValue(toArrayResult([{ name: '_id_' }]));

      await repository.ensureIndexes();

      expect(devices.createIndex).toHaveBeenCalledWith({ userId: 1, lastSeenAt: -1 }, { name: 'userId_lastSeen' });
      expect(devices.createIndex).toHaveBeenCalledWith(
        { lastSeenAt: 1 },
        { name: 'lastSeen_ttl', expireAfterSeconds: 5_184_000 },
      );
      expect(command).not.toHaveBeenCalled();
    });

    it('adjusts an existing TTL with collMod when the period changed', async () => {
      const { devices, command, repository } = harness(90);
      devices.listIndexes.mockReturnValue(toArrayResult([{ name: 'lastSeen_ttl', expireAfterSeconds: 5_184_000 }]));

      await repository.ensureIndexes();

      expect(command).toHaveBeenCalledWith({
        collMod: 'devices',
        index: { name: 'lastSeen_ttl', expireAfterSeconds: 7_776_000 },
      });
      expect(devices.createIndex).toHaveBeenCalledTimes(1);
    });

    it('creates the TTL when the collection does not exist yet', async () => {
      const { devices, repository } = harness();
      devices.listIndexes.mockReturnValue({
        toArray: vi.fn().mockRejectedValue(Object.assign(new Error('ns not found'), { code: 26 })),
      });

      await repository.ensureIndexes();

      expect(devices.createIndex).toHaveBeenCalledTimes(2);
    });
  });
});
