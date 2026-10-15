import type { Collection, Db, Document } from 'mongodb';
import {
  AccountClosure,
  OPEN_CLOSURE_STATUSES,
  type AccountClosureProps,
  type ClosureRefund,
  type ClosureStatus,
} from '../../../domain/accountClosures/accountClosure.js';
import type { ClosureListCriteria, IAccountClosureRepository } from '../../../application/features/accountClosures/common/ports.js';

export const ACCOUNT_CLOSURES_COLLECTION = 'accountClosures';

const DUPLICATE_KEY = 11000;
const OPEN = { $in: [...OPEN_CLOSURE_STATUSES] };

const date = (value: unknown): Date | null => (value ? new Date(value as Date) : null);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function toDocument(closure: AccountClosure): Document {
  const { id, ...rest } = closure.toProps();
  return { _id: id, ...rest };
}

function fromDocument(doc: Document): AccountClosure {
  const refund = doc.refund as Document | null | undefined;
  const props: AccountClosureProps = {
    id: String(doc._id),
    userId: doc.userId as string,
    role: doc.role as AccountClosureProps['role'],
    status: doc.status as ClosureStatus,
    requestedAt: new Date(doc.requestedAt as Date),
    balanceAtRequest: (doc.balanceAtRequest as number | null | undefined) ?? null,
    currency: text(doc.currency),
    debtResolution: (doc.debtResolution as AccountClosureProps['debtResolution'] | undefined) ?? null,
    debtResolvedBy: text(doc.debtResolvedBy),
    debtResolvedAt: date(doc.debtResolvedAt),
    debtReason: text(doc.debtReason),
    refund: refund
      ? ({
          amount: refund.amount as number,
          reference: text(refund.reference),
          paidOn: text(refund.paidOn),
          note: text(refund.note),
          movementId: text(refund.movementId),
          recordedBy: refund.recordedBy as string,
          recordedAt: new Date(refund.recordedAt as Date),
        } satisfies ClosureRefund)
      : null,
    closedAt: date(doc.closedAt),
    closedBy: text(doc.closedBy),
    reopenedAt: date(doc.reopenedAt),
    endedAt: date(doc.endedAt),
    endedBy: text(doc.endedBy),
    endReason: text(doc.endReason),
    updatedAt: new Date(doc.updatedAt as Date),
  };
  return AccountClosure.rehydrate(props);
}

/**
 * Requests to leave the platform (feature 029). The account state is derived from here and never
 * written to `users`, whose whole document the app replaces on every profile edit — like blocks.
 */
export class AccountClosureRepository implements IAccountClosureRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(ACCOUNT_CLOSURES_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex(
      { userId: 1 },
      { name: 'user_open_unique', unique: true, partialFilterExpression: { status: OPEN } },
    );
    await this.collection.createIndex({ status: 1, requestedAt: -1 }, { name: 'status_requested' });
    await this.collection.createIndex({ userId: 1, requestedAt: -1 }, { name: 'user_requested' });
  }

  async findById(id: string): Promise<AccountClosure | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? fromDocument(doc) : null;
  }

  async findOpenByUserId(userId: string): Promise<AccountClosure | null> {
    const doc = await this.collection.findOne({ userId, status: OPEN });
    return doc ? fromDocument(doc) : null;
  }

  async findLatestByUserId(userId: string): Promise<AccountClosure | null> {
    const doc = await this.collection.findOne({ userId }, { sort: { requestedAt: -1 } });
    return doc ? fromDocument(doc) : null;
  }

  async findClosedByUserId(userId: string): Promise<AccountClosure | null> {
    const doc = await this.collection.findOne({ userId, status: 'closed' });
    return doc ? fromDocument(doc) : null;
  }

  async openUserIds(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const docs = await this.collection.find({ userId: { $in: [...userIds] }, status: OPEN }, { projection: { userId: 1 } }).toArray();
    return new Set(docs.map((doc) => doc.userId as string));
  }

  async add(closure: AccountClosure): Promise<'added' | 'already_open'> {
    try {
      await this.collection.insertOne(toDocument(closure));
      return 'added';
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return 'already_open';
      throw error;
    }
  }

  async save(closure: AccountClosure, expectedStatus: ClosureStatus): Promise<boolean> {
    const result = await this.collection.replaceOne({ _id: closure.id, status: expectedStatus } as Document, toDocument(closure));
    return result.matchedCount === 1;
  }

  async list(criteria: ClosureListCriteria): Promise<{ items: AccountClosure[]; totalItems: number }> {
    const filter: Document = { status: { $in: [...criteria.statuses] } };
    if (criteria.userIds !== null) filter.userId = { $in: [...criteria.userIds] };
    if (criteria.debt === 'with') filter.balanceAtRequest = { $lt: 0 };
    if (criteria.debt === 'without') filter.$or = [{ balanceAtRequest: null }, { balanceAtRequest: { $gte: 0 } }];
    const skip = (criteria.page - 1) * criteria.pageSize;
    const [docs, totalItems] = await Promise.all([
      this.collection.find(filter).sort({ requestedAt: -1, _id: -1 }).skip(skip).limit(criteria.pageSize).toArray(),
      this.collection.countDocuments(filter),
    ]);
    return { items: docs.map(fromDocument), totalItems };
  }
}
