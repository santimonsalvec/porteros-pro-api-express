import type {
  Device,
  DevicePlatform,
  DeviceUpsertResult,
  IDeviceRepository,
} from '../../src/application/features/devices/common/ports.js';

/** In-memory `devices`, keyed by token — same semantics as `MongoDeviceRepository`. */
export class FakeDeviceRepository implements IDeviceRepository {
  private readonly byToken = new Map<string, Device & { createdAt: Date }>();

  async upsert(token: string, userId: string, platform: DevicePlatform, now: Date): Promise<DeviceUpsertResult> {
    const before = this.byToken.get(token);
    this.byToken.set(token, { token, userId, platform, lastSeenAt: now, createdAt: before?.createdAt ?? now });
    if (!before) return { kind: 'registered' };
    if (before.userId === userId) return { kind: 'refreshed' };
    return { kind: 'transferred', previousUserId: before.userId };
  }

  async trimToLimit(userId: string, max: number): Promise<Device[]> {
    const removed = [...this.byToken.values()]
      .filter((device) => device.userId === userId)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(max);
    for (const device of removed) this.byToken.delete(device.token);
    return removed.map(strip);
  }

  async removeOwned(token: string, userId: string): Promise<boolean> {
    if (this.byToken.get(token)?.userId !== userId) return false;
    return this.byToken.delete(token);
  }

  async removeByTokens(tokens: readonly string[]): Promise<number> {
    return tokens.filter((token) => this.byToken.delete(token)).length;
  }

  async findByUserIds(userIds: readonly string[]): Promise<Device[]> {
    return [...this.byToken.values()].filter((device) => userIds.includes(device.userId)).map(strip);
  }

  /** Test helper: stores a device as-is (e.g. an old `lastSeenAt`). */
  seed(device: Device): void {
    this.byToken.set(device.token, { ...device, createdAt: device.lastSeenAt });
  }

  all(): Array<Device & { createdAt: Date }> {
    return [...this.byToken.values()].map((device) => ({ ...device }));
  }
}

function strip(device: Device & { createdAt: Date }): Device {
  return { token: device.token, userId: device.userId, platform: device.platform, lastSeenAt: device.lastSeenAt };
}
