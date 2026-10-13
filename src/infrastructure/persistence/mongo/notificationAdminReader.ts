import type { Collection, Db, Document } from 'mongodb';
import type { INotificationAdminReader } from '../../../application/features/notifications/common/adminPorts.js';
import type { NotificationItem } from '../../../application/features/notifications/common/ports.js';
import { DEVICES_COLLECTION } from './deviceRepository.js';
import { NOTIFICATIONS_COLLECTION, notificationFromDocument } from './notificationRepository.js';

/**
 * The admin's reads of a user's notices (admin spec 006, research §11), by `user_created` and
 * `userId_lastSeen`. Unlike the inbox, deleted notices are listed: the admin shows them marked.
 */
export class NotificationAdminReader implements INotificationAdminReader {
  private readonly notifications: Collection<Document>;
  private readonly devices: Collection<Document>;

  constructor(db: Db) {
    this.notifications = db.collection(NOTIFICATIONS_COLLECTION);
    this.devices = db.collection(DEVICES_COLLECTION);
  }

  async listAllForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]> {
    const docs = await this.notifications.find({ userId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray();
    return docs.map(notificationFromDocument);
  }

  countAllForUser(userId: string): Promise<number> {
    return this.notifications.countDocuments({ userId });
  }

  async devicesOf(userId: string): Promise<{ count: number; lastSeenAt: Date | null }> {
    // The push token is the device's key and never leaves the server: projected out.
    const docs = await this.devices.find({ userId }, { projection: { _id: 0, lastSeenAt: 1 } }).toArray();
    const last = docs.reduce<Date | null>((latest, doc) => {
      const seen = new Date(doc.lastSeenAt as Date);
      return !latest || seen > latest ? seen : latest;
    }, null);
    return { count: docs.length, lastSeenAt: last };
  }
}
