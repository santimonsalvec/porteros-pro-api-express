import { describe, expect, it } from 'vitest';
import type { Collection, Db, Document } from 'mongodb';
import { NotificationAdminReader } from '../../../../../src/infrastructure/persistence/mongo/notificationAdminReader.js';
import { createFakeCollection, toArrayCursor, type FakeMongoCollection } from '../../../../fakes/fakeMongoCollection.js';

const AT = new Date('2026-10-18T21:10:00.000Z');

function readerWith(collections: Record<string, FakeMongoCollection>) {
  const db = { collection: (name: string) => (collections[name] ?? createFakeCollection()) as unknown as Collection<Document> } as unknown as Db;
  return new NotificationAdminReader(db);
}

describe('NotificationAdminReader (mocked driver, admin spec 006)', () => {
  it("lists a user's notices newest first, the deleted ones included", async () => {
    const notifications = createFakeCollection();
    const cursor = toArrayCursor([
      { _id: 'n-1', userId: 'u-1', type: 'booking.cancelled', title: 'Partido cancelado', body: 'b', data: { requestId: 'r-1' }, createdAt: AT, readAt: null, deletedAt: AT },
    ]);
    notifications.find.mockReturnValue(cursor);
    notifications.countDocuments.mockResolvedValue(7);
    const reader = readerWith({ notifications });

    const items = await reader.listAllForUser('u-1', 20, 20);

    expect(items).toEqual([expect.objectContaining({ id: 'n-1', type: 'booking.cancelled', deletedAt: AT, data: { requestId: 'r-1' } })]);
    expect(notifications.find).toHaveBeenCalledWith({ userId: 'u-1' });
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(cursor.skip).toHaveBeenCalledWith(20);
    expect(cursor.limit).toHaveBeenCalledWith(20);
    expect(await reader.countAllForUser('u-1')).toBe(7);
    expect(notifications.countDocuments).toHaveBeenCalledWith({ userId: 'u-1' });
  });

  it("counts the user's devices and their last use, never reading their tokens", async () => {
    const devices = createFakeCollection();
    devices.find.mockReturnValue(toArrayCursor([{ lastSeenAt: AT }, { lastSeenAt: new Date('2026-10-01T00:00:00.000Z') }]));
    const reader = readerWith({ devices });

    expect(await reader.devicesOf('u-1')).toEqual({ count: 2, lastSeenAt: AT });
    expect(devices.find).toHaveBeenCalledWith({ userId: 'u-1' }, { projection: { _id: 0, lastSeenAt: 1 } });

    devices.find.mockReturnValue(toArrayCursor([]));
    expect(await reader.devicesOf('u-2')).toEqual({ count: 0, lastSeenAt: null });
  });
});
