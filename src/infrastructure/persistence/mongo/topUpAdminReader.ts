import type { Collection, Db, Document } from 'mongodb';
import type { ITopUpAdminReader, TopUpAdminFilter, TopUpAdminRecord } from '../../../application/features/payments/common/adminPorts.js';
import type { TopUp, TopUpCheck } from '../../../domain/payments/topUp.js';
import { TOP_UP_ADMIN_SORT, topUpAdminFilter } from './topUpAdminPipelines.js';
import { TOP_UPS_COLLECTION, topUpFromDocument } from './topUpRepository.js';

/** The admin's reads of top-ups (admin spec 007, US1), newest first. */
export class TopUpAdminReader implements ITopUpAdminReader {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(TOP_UPS_COLLECTION);
  }

  async list(filter: TopUpAdminFilter & { page: number; pageSize: number }): Promise<{ items: TopUp[]; totalItems: number }> {
    const match = topUpAdminFilter(filter);
    const [docs, totalItems] = await Promise.all([
      this.collection
        .find(match)
        .sort(TOP_UP_ADMIN_SORT)
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      this.collection.countDocuments(match),
    ]);
    return { items: docs.map(topUpFromDocument), totalItems };
  }

  count(filter: TopUpAdminFilter): Promise<number> {
    return this.collection.countDocuments(topUpAdminFilter(filter));
  }

  async all(filter: TopUpAdminFilter, limit: number): Promise<TopUp[]> {
    const docs = await this.collection.find(topUpAdminFilter(filter)).sort(TOP_UP_ADMIN_SORT).limit(limit).toArray();
    return docs.map(topUpFromDocument);
  }

  async get(topUpId: string): Promise<TopUpAdminRecord | null> {
    const doc = await this.collection.findOne({ _id: topUpId } as Document);
    if (!doc) return null;
    return { topUp: topUpFromDocument(doc), checkLog: (doc.checkLog as TopUpCheck[] | undefined) ?? [] };
  }
}
