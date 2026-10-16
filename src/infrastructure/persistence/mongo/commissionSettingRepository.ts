import type { Collection, Db, Document } from 'mongodb';
import type { ICommissionSettingRepository } from '../../../application/features/operatingBalance/common/ports.js';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type { CommissionRecord, CreateResult, ICommissionAdmin, PriceFilter } from '../../../application/features/pricing/common/ports.js';
import { CommissionSetting } from '../../../domain/operatingBalance/commissionSetting.js';
import { dropIndexIfExists } from './dropIndexIfExists.js';
import { createPrice, findPriceById, priceFilter, priceRecordOf } from './priceDocuments.js';
import { deleteById, updateAtRevision } from './revisionWrite.js';

/**
 * Platform commissions (country, market or zone), one per scope, reference and tier. The
 * operating balance reads them through `ICommissionSettingRepository`; the admin web writes them through
 * `ICommissionAdmin` (spec 004 of the admin).
 */
export class CommissionSettingRepository implements ICommissionSettingRepository, ICommissionAdmin {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('commissionSettings');
  }

  async ensureIndexes(): Promise<void> {
    // Feature 024: one commission per modality tier, so the older unique indexes must go first.
    // The match level (amateur/tournament) was withdrawn: its commissions are dropped, as the
    // modality's general commission now covers every match, and the index no longer includes it.
    await dropIndexIfExists(this.collection, 'scope_refId');
    await dropIndexIfExists(this.collection, 'scope_refId_modality_level');
    await this.collection.deleteMany({ level: { $ne: null } });
    await this.collection.createIndex(
      { scope: 1, refId: 1, modality: 1 },
      { name: 'scope_refId_modality', unique: true },
    );
  }

  /** Every setting for any of these zones, anchor cities or countries, in one read. */
  async findFor(refs: { zoneIds: string[]; marketIds: string[]; countryIds: string[] }): Promise<CommissionSetting[]> {
    const or = [
      ...(refs.zoneIds.length > 0 ? [{ scope: 'zone', refId: { $in: refs.zoneIds } }] : []),
      ...(refs.marketIds.length > 0 ? [{ scope: 'market', refId: { $in: refs.marketIds } }] : []),
      ...(refs.countryIds.length > 0 ? [{ scope: 'country', refId: { $in: refs.countryIds } }] : []),
    ];
    if (or.length === 0) return [];
    const docs = await this.collection.find({ $or: or }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  private fromDocument(doc: Document): CommissionSetting {
    return new CommissionSetting({
      id: String(doc._id),
      scope: doc.scope as string,
      refId: String(doc.refId),
      amount: doc.amount as number,
      modality: (doc.modality as string | undefined) ?? null,
      revision: doc.revision as number | undefined,
    });
  }

  private recordOf(doc: Document): CommissionRecord {
    return priceRecordOf<CommissionRecord['scope']>(doc, (stored) => this.fromDocument(stored));
  }

  async find(filter: PriceFilter): Promise<CommissionRecord[]> {
    const query = priceFilter(filter);
    if (query === null) return [];
    const docs = await this.collection.find(query).toArray();
    return docs.map((doc) => this.recordOf(doc));
  }

  async getById(id: string): Promise<CommissionRecord | null> {
    const doc = await findPriceById(this.collection, id);
    return doc ? this.recordOf(doc) : null;
  }

  create(commission: Omit<CommissionRecord, 'revision' | 'invalid'>): Promise<CreateResult> {
    const { id, scope, refId, modality, amount } = commission;
    return createPrice(this.collection, id, { scope, refId, modality }, amount);
  }

  updateAmount(id: string, expectedRevision: number, amount: number): Promise<UpdateResult> {
    return updateAtRevision(this.collection, id, expectedRevision, { amount });
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
