import type { INotificationAdminReader } from '../../src/application/features/notifications/common/adminPorts.js';
import type { NotificationItem } from '../../src/application/features/notifications/common/ports.js';
import type { FakeDeviceRepository } from './fakeDeviceRepository.js';
import type { FakeNotificationRepository } from './fakeNotificationRepository.js';

/** The admin's reads of a user's notices over the in-memory stores, deleted ones included (admin spec 006). */
export class FakeNotificationAdminReader implements INotificationAdminReader {
  constructor(
    private readonly notifications: FakeNotificationRepository,
    private readonly devices: FakeDeviceRepository,
  ) {}

  private ofUser(userId: string): NotificationItem[] {
    return this.notifications
      .all()
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  }

  async listAllForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]> {
    return this.ofUser(userId).slice(skip, skip + limit);
  }

  async countAllForUser(userId: string): Promise<number> {
    return this.ofUser(userId).length;
  }

  async devicesOf(userId: string): Promise<{ count: number; lastSeenAt: Date | null }> {
    const own = this.devices.all().filter((device) => device.userId === userId);
    const last = own.reduce<Date | null>((latest, device) => (!latest || device.lastSeenAt > latest ? device.lastSeenAt : latest), null);
    return { count: own.length, lastSeenAt: last };
  }
}
