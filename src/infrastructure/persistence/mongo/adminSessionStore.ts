import type { Collection, Db, Document } from 'mongodb';
import type { IAdminSessionStore } from '../../../application/features/staff/common/ports.js';
import { AdminSession, type AdminSessionRevokedReason } from '../../../domain/staff/adminSession.js';

export const ADMIN_SESSIONS_COLLECTION = 'adminSessions';

/** An ended session is kept 30 days past its 12-hour limit for support, then removed. */
const EXPIRED_SESSION_RETENTION_SECONDS = 30 * 24 * 60 * 60;

function toDocument(session: AdminSession): Document {
  return {
    _id: session.id,
    staffId: session.staffId,
    userId: session.userId,
    refreshTokenHash: session.refreshTokenHash,
    previousRefreshTokenHash: session.previousRefreshTokenHash,
    startedAt: session.startedAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    idleExpiresAt: session.idleExpiresAt,
    revokedAt: session.revokedAt,
    revokedReason: session.revokedReason,
    userAgent: session.userAgent,
    ip: session.ip,
  };
}

function fromDocument(doc: Document): AdminSession {
  return AdminSession.rehydrate({
    id: String(doc._id),
    staffId: doc.staffId as string,
    userId: doc.userId as string,
    refreshTokenHash: doc.refreshTokenHash as string,
    previousRefreshTokenHash: (doc.previousRefreshTokenHash as string | null | undefined) ?? null,
    startedAt: new Date(doc.startedAt as Date),
    absoluteExpiresAt: new Date(doc.absoluteExpiresAt as Date),
    idleExpiresAt: new Date(doc.idleExpiresAt as Date),
    revokedAt: doc.revokedAt ? new Date(doc.revokedAt as Date) : null,
    revokedReason: (doc.revokedReason as AdminSessionRevokedReason | null | undefined) ?? null,
    userAgent: (doc.userAgent as string | undefined) ?? '',
    ip: (doc.ip as string | undefined) ?? '',
  });
}

export class MongoAdminSessionStore implements IAdminSessionStore {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(ADMIN_SESSIONS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ refreshTokenHash: 1 }, { name: 'refresh_unique', unique: true });
    await this.collection.createIndex(
      { previousRefreshTokenHash: 1 },
      { name: 'previous_refresh', partialFilterExpression: { previousRefreshTokenHash: { $type: 'string' } } },
    );
    await this.collection.createIndex({ staffId: 1, revokedAt: 1 }, { name: 'staff_active' });
    await this.collection.createIndex({ absoluteExpiresAt: 1 }, { name: 'expiry_ttl', expireAfterSeconds: EXPIRED_SESSION_RETENTION_SECONDS });
  }

  async add(session: AdminSession): Promise<void> {
    await this.collection.insertOne(toDocument(session));
  }

  async getById(id: string): Promise<AdminSession | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? fromDocument(doc) : null;
  }

  async findByRefreshHash(refreshTokenHash: string): Promise<AdminSession | null> {
    const doc = await this.collection.findOne({ refreshTokenHash });
    return doc ? fromDocument(doc) : null;
  }

  async findByPreviousRefreshHash(refreshTokenHash: string): Promise<AdminSession | null> {
    const doc = await this.collection.findOne({ previousRefreshTokenHash: refreshTokenHash });
    return doc ? fromDocument(doc) : null;
  }

  async replaceIfCurrent(session: AdminSession, expectedHash: string): Promise<boolean> {
    const result = await this.collection.replaceOne({ _id: session.id, refreshTokenHash: expectedHash } as Document, toDocument(session));
    return result.matchedCount === 1;
  }

  async update(session: AdminSession): Promise<void> {
    await this.collection.replaceOne({ _id: session.id } as Document, toDocument(session));
  }

  async revokeAllForStaff(staffId: string, reason: AdminSessionRevokedReason, now: Date): Promise<string[]> {
    const open = await this.collection.find({ staffId, revokedAt: null }, { projection: { _id: 1 } }).toArray();
    const ids = open.map((doc) => String(doc._id));
    if (ids.length === 0) return [];
    await this.collection.updateMany({ _id: { $in: ids }, revokedAt: null } as Document, { $set: { revokedAt: now, revokedReason: reason } });
    return ids;
  }
}
