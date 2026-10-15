import type { Collection, Db, Document } from 'mongodb';
import type { IOperatingBalanceRepository } from '../../../application/features/operatingBalance/common/ports.js';
import { OperatingBalance } from '../../../domain/operatingBalance/operatingBalance.js';

export const OPERATING_BALANCES_COLLECTION = 'operatingBalances';

export function operatingBalanceFromDocument(doc: Document): OperatingBalance {
  return OperatingBalance.rehydrate({
    goalkeeperId: String(doc._id),
    currency: doc.currency as string,
    balance: doc.balance as number,
    lastSequence: doc.lastSequence as number,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  });
}

/** One operating balance per goalkeeper (`_id` = the goalkeeper's user id). Written only by the operating balance store. */
export class OperatingBalanceRepository implements IOperatingBalanceRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(OPERATING_BALANCES_COLLECTION);
  }

  /** The admin's operating balances by balance (admin spec 007, research §4). */
  async ensureAdminIndexes(): Promise<void> {
    await this.collection.createIndex({ balance: 1, _id: 1 }, { name: 'balance_id' });
  }

  async findByGoalkeeperId(goalkeeperId: string): Promise<OperatingBalance | null> {
    const doc = await this.collection.findOne({ _id: goalkeeperId } as Document);
    return doc ? operatingBalanceFromDocument(doc) : null;
  }

  async findByGoalkeeperIds(goalkeeperIds: readonly string[]): Promise<OperatingBalance[]> {
    if (goalkeeperIds.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: [...goalkeeperIds] } } as Document).toArray();
    return docs.map(operatingBalanceFromDocument);
  }
}
