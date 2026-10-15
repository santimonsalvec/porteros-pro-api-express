import type { Collection, Db, Document } from 'mongodb';
import type { IDepositAdminReader, DepositAdminFilter, DepositAdminRecord } from '../../../application/features/payments/common/adminPorts.js';
import type { Deposit, DepositCheck } from '../../../domain/deposits/deposit.js';
import { DEPOSIT_ADMIN_SORT, depositAdminFilter } from './depositAdminPipelines.js';
import { DEPOSITS_COLLECTION, depositFromDocument } from './depositRepository.js';

/** The admin's reads of deposits (admin spec 007, US1), newest first. */
export class DepositAdminReader implements IDepositAdminReader {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(DEPOSITS_COLLECTION);
  }

  async list(filter: DepositAdminFilter & { page: number; pageSize: number }): Promise<{ items: Deposit[]; totalItems: number }> {
    const match = depositAdminFilter(filter);
    const [docs, totalItems] = await Promise.all([
      this.collection
        .find(match)
        .sort(DEPOSIT_ADMIN_SORT)
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      this.collection.countDocuments(match),
    ]);
    return { items: docs.map(depositFromDocument), totalItems };
  }

  count(filter: DepositAdminFilter): Promise<number> {
    return this.collection.countDocuments(depositAdminFilter(filter));
  }

  async all(filter: DepositAdminFilter, limit: number): Promise<Deposit[]> {
    const docs = await this.collection.find(depositAdminFilter(filter)).sort(DEPOSIT_ADMIN_SORT).limit(limit).toArray();
    return docs.map(depositFromDocument);
  }

  async get(depositId: string): Promise<DepositAdminRecord | null> {
    const doc = await this.collection.findOne({ _id: depositId } as Document);
    if (!doc) return null;
    return { deposit: depositFromDocument(doc), checkLog: (doc.checkLog as DepositCheck[] | undefined) ?? [] };
  }
}
