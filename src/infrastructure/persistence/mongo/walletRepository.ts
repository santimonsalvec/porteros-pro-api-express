import type { Collection, Db, Document } from 'mongodb';
import type { IWalletRepository } from '../../../application/features/wallet/common/ports.js';
import { Wallet } from '../../../domain/wallet/wallet.js';

export const WALLETS_COLLECTION = 'wallets';

export function walletFromDocument(doc: Document): Wallet {
  return Wallet.rehydrate({
    goalkeeperId: String(doc._id),
    currency: doc.currency as string,
    balance: doc.balance as number,
    lastSequence: doc.lastSequence as number,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  });
}

/** One wallet per goalkeeper (`_id` = the goalkeeper's user id). Written only by the wallet store. */
export class WalletRepository implements IWalletRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(WALLETS_COLLECTION);
  }

  async findByGoalkeeperId(goalkeeperId: string): Promise<Wallet | null> {
    const doc = await this.collection.findOne({ _id: goalkeeperId } as Document);
    return doc ? walletFromDocument(doc) : null;
  }

  async findByGoalkeeperIds(goalkeeperIds: readonly string[]): Promise<Wallet[]> {
    if (goalkeeperIds.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: [...goalkeeperIds] } } as Document).toArray();
    return docs.map(walletFromDocument);
  }
}
