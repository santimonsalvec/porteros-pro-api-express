import type { Collection, Db, Document } from 'mongodb';
import type {
  Device,
  DevicePlatform,
  DeviceUpsertResult,
  IDeviceRepository,
} from '../../../application/features/devices/common/ports.js';
import { tokenHash } from '../../push/tokenRef.js';

export const DEVICES_COLLECTION = 'devices';
const TTL_INDEX = 'lastSeen_ttl';
const SECONDS_PER_DAY = 24 * 60 * 60;

interface DeviceDocument {
  _id: string;
  token: string;
  userId: string;
  platform: DevicePlatform;
  createdAt: Date;
  lastSeenAt: Date;
}

/**
 * One document per push token, keyed by its hash (research §2), so a token has one owner at
 * most. Stale devices expire through a TTL on `lastSeenAt` (research §4).
 */
export class MongoDeviceRepository implements IDeviceRepository {
  private readonly collection: Collection<DeviceDocument>;

  constructor(
    private readonly db: Db,
    private readonly inactivityDays: number,
  ) {
    this.collection = db.collection<DeviceDocument>(DEVICES_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ userId: 1, lastSeenAt: -1 }, { name: 'userId_lastSeen' });
    const expireAfterSeconds = this.inactivityDays * SECONDS_PER_DAY;
    const existing = (await this.listIndexes()).find((index) => index.name === TTL_INDEX);
    if (existing && existing.expireAfterSeconds !== expireAfterSeconds) {
      // The period changed in configuration: adjust it in place instead of dropping the index.
      await this.db.command({ collMod: DEVICES_COLLECTION, index: { name: TTL_INDEX, expireAfterSeconds } });
      return;
    }
    await this.collection.createIndex({ lastSeenAt: 1 }, { name: TTL_INDEX, expireAfterSeconds });
  }

  async upsert(token: string, userId: string, platform: DevicePlatform, now: Date): Promise<DeviceUpsertResult> {
    try {
      return await this.upsertOnce(token, userId, platform, now);
    } catch (error) {
      // Two first registrations of one token raced on the insert: the retry is a plain update.
      if ((error as { code?: unknown }).code !== 11000) throw error;
      return this.upsertOnce(token, userId, platform, now);
    }
  }

  async trimToLimit(userId: string, max: number): Promise<Device[]> {
    const extra = await this.collection.find({ userId }).sort({ lastSeenAt: -1 }).skip(max).toArray();
    if (extra.length === 0) return [];
    await this.collection.deleteMany({ _id: { $in: extra.map((doc) => doc._id) } });
    return extra.map(toDevice);
  }

  async removeOwned(token: string, userId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: tokenHash(token), userId });
    return result.deletedCount === 1;
  }

  async removeByTokens(tokens: readonly string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const result = await this.collection.deleteMany({ _id: { $in: tokens.map(tokenHash) } });
    return result.deletedCount;
  }

  async findByUserIds(userIds: readonly string[]): Promise<Device[]> {
    if (userIds.length === 0) return [];
    const docs = await this.collection.find({ userId: { $in: [...userIds] } }).toArray();
    return docs.map(toDevice);
  }

  private async upsertOnce(
    token: string,
    userId: string,
    platform: DevicePlatform,
    now: Date,
  ): Promise<DeviceUpsertResult> {
    const before = await this.collection.findOneAndUpdate(
      { _id: tokenHash(token) },
      { $set: { token, userId, platform, lastSeenAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: 'before' },
    );
    if (!before) return { kind: 'registered' };
    if (before.userId === userId) return { kind: 'refreshed' };
    return { kind: 'transferred', previousUserId: before.userId };
  }

  private async listIndexes(): Promise<Document[]> {
    try {
      return await this.collection.listIndexes().toArray();
    } catch (error) {
      // The collection doesn't exist yet (first start): no index to compare with.
      if ((error as { code?: unknown }).code === 26) return [];
      throw error;
    }
  }
}

function toDevice(doc: DeviceDocument): Device {
  return { token: doc.token, userId: doc.userId, platform: doc.platform, lastSeenAt: doc.lastSeenAt };
}
