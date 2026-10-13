import type { Collection, Db, Document } from 'mongodb';
import type { BlockWriteResult, IUserBlockRepository, UserBlockRecord } from '../../../application/features/users/common/ports.js';

const DUPLICATE_KEY = 11000;

/**
 * The block of each user (admin spec 005, research §1), in `userBlocks` keyed by the user id — not
 * in `users`, whose whole document the app replaces on every profile edit. Each change is one
 * conditional write, so two members blocking at once change it once.
 */
export class UserBlockRepository implements IUserBlockRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('userBlocks');
  }

  async findByUserId(userId: string): Promise<UserBlockRecord | null> {
    const doc = await this.collection.findOne({ _id: userId } as Document);
    return doc ? toRecord(doc) : null;
  }

  async findByUserIds(userIds: readonly string[]): Promise<Map<string, UserBlockRecord>> {
    const docs = await this.collection.find({ _id: { $in: [...userIds] } } as Document).toArray();
    return new Map(docs.map((doc) => [String(doc._id), toRecord(doc)]));
  }

  async block(userId: string, by: string, reason: string, at: Date): Promise<BlockWriteResult> {
    try {
      // Matches a never-blocked user (upserted) or an unblocked one; a blocked one makes the upsert
      // collide with its own id, which means "already blocked".
      const doc = await this.collection.findOneAndUpdate(
        { _id: userId, blocked: { $ne: true } } as Document,
        { $set: { blocked: true, blockedAt: at, blockedBy: by, blockReason: reason }, $inc: { revision: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
      return doc ? { outcome: 'changed', record: toRecord(doc) } : this.unchanged(userId);
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return this.unchanged(userId);
      throw error;
    }
  }

  async unblock(userId: string, by: string, reason: string, at: Date): Promise<BlockWriteResult> {
    const doc = await this.collection.findOneAndUpdate(
      { _id: userId, blocked: true } as Document,
      { $set: { blocked: false, unblockedAt: at, unblockedBy: by, unblockReason: reason }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    );
    return doc ? { outcome: 'changed', record: toRecord(doc) } : this.unchanged(userId);
  }

  private async unchanged(userId: string): Promise<BlockWriteResult> {
    return { outcome: 'unchanged', record: (await this.findByUserId(userId)) ?? emptyRecord(userId) };
  }
}

function toRecord(doc: Document): UserBlockRecord {
  const date = (value: unknown) => (value ? new Date(value as Date) : null);
  return {
    userId: String(doc._id),
    blocked: doc.blocked === true,
    blockedAt: date(doc.blockedAt),
    blockedBy: (doc.blockedBy as string | undefined) ?? null,
    blockReason: (doc.blockReason as string | undefined) ?? null,
    unblockedAt: date(doc.unblockedAt),
    unblockedBy: (doc.unblockedBy as string | undefined) ?? null,
    unblockReason: (doc.unblockReason as string | undefined) ?? null,
    revision: (doc.revision as number | undefined) ?? 0,
  };
}

function emptyRecord(userId: string): UserBlockRecord {
  return { userId, blocked: false, blockedAt: null, blockedBy: null, blockReason: null, unblockedAt: null, unblockedBy: null, unblockReason: null, revision: 0 };
}
