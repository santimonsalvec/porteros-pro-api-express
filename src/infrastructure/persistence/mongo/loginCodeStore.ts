import type { Collection, Db, Document } from 'mongodb';
import type { ILoginCodeStore, LoginCodeWriteResult } from '../../../application/features/auth/common/ports.js';
import {
  loginCodeId,
  MAX_FAILED_ATTEMPTS,
  purgeAfter,
  type LoginCodeAudience,
  type LoginCodeState,
} from '../../../domain/auth/loginCode.js';

export const LOGIN_CODES_COLLECTION = 'loginCodes';

const DUPLICATE_KEY = 11000;

/**
 * Sign-in codes (admin spec 009, research §3): `_id` = `"{audience}:{email}"`, the hash and never
 * the code. A request writes at the revision it read; using a code and counting a failure are
 * single atomic updates that do not move the revision, so they never make a request look raced.
 * Each document goes away at `purgeAt` (FR-021).
 */
export class MongoLoginCodeStore implements ILoginCodeStore {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(LOGIN_CODES_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ purgeAt: 1 }, { name: 'purgeAt_ttl', expireAfterSeconds: 0 });
  }

  async get(audience: LoginCodeAudience, email: string): Promise<LoginCodeState | null> {
    const doc = await this.collection.findOne({ _id: loginCodeId(audience, email) } as Document);
    return doc ? fromDocument(doc) : null;
  }

  async insert(state: LoginCodeState): Promise<LoginCodeWriteResult> {
    try {
      await this.collection.insertOne(toDocument(state));
      return 'saved';
    } catch (error) {
      if ((error as { code?: unknown }).code === DUPLICATE_KEY) return 'conflict';
      throw error;
    }
  }

  async replaceAtRevision(next: LoginCodeState, expectedRevision: number): Promise<LoginCodeWriteResult> {
    const result = await this.collection.replaceOne({ _id: next.id, revision: expectedRevision } as Document, toDocument(next));
    return result.matchedCount > 0 ? 'saved' : 'conflict';
  }

  async consume(audience: LoginCodeAudience, email: string, codeHash: string, now: Date): Promise<boolean> {
    const doc = await this.collection.findOneAndUpdate(
      { _id: loginCodeId(audience, email), status: 'active', codeHash, expiresAt: { $gt: now }, failedAttempts: { $lt: MAX_FAILED_ATTEMPTS } } as Document,
      { $set: { status: 'used', purgeAt: purgeAfter(now) } },
    );
    return doc !== null;
  }

  async recordFailure(audience: LoginCodeAudience, email: string, now: Date): Promise<void> {
    const reachesLimit = { $gte: [{ $add: ['$failedAttempts', 1] }, MAX_FAILED_ATTEMPTS] };
    await this.collection.updateOne({ _id: loginCodeId(audience, email), status: 'active', expiresAt: { $gt: now } } as Document, [
      {
        $set: {
          failedAttempts: { $add: ['$failedAttempts', 1] },
          status: { $cond: [reachesLimit, 'invalidated', '$status'] },
          purgeAt: { $cond: [reachesLimit, purgeAfter(now), '$purgeAt'] },
        },
      },
    ]);
  }
}

function toDocument(state: LoginCodeState): Document {
  const { id, ...rest } = state;
  return { _id: id, ...rest };
}

function fromDocument(doc: Document): LoginCodeState {
  const date = (value: unknown) => new Date(value as Date);
  return {
    id: String(doc._id),
    audience: doc.audience as LoginCodeAudience,
    email: doc.email as string,
    codeId: (doc.codeId as string | null) ?? null,
    codeHash: (doc.codeHash as string | null) ?? null,
    status: doc.status as LoginCodeState['status'],
    issuedAt: date(doc.issuedAt),
    expiresAt: date(doc.expiresAt),
    expiryMinutes: doc.expiryMinutes as number,
    failedAttempts: (doc.failedAttempts as number | undefined) ?? 0,
    sends: ((doc.sends as Date[] | undefined) ?? []).map(date),
    lastSentAt: doc.lastSentAt ? date(doc.lastSentAt) : null,
    revision: (doc.revision as number | undefined) ?? 0,
    purgeAt: date(doc.purgeAt),
  };
}
