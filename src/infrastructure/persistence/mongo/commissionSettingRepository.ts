import type { Collection, Db, Document } from 'mongodb';
import type { ICommissionSettingRepository } from '../../../application/features/operatingBalance/common/ports.js';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type { CommissionFields, CommissionRecord, CreateResult, ICommissionAdmin, PriceFilter } from '../../../application/features/pricing/common/ports.js';
import type { PricedModality } from '../../../domain/bookings/matchFormat.js';
import { CommissionSetting } from '../../../domain/operatingBalance/commissionSetting.js';
import { dropIndexIfExists } from './dropIndexIfExists.js';
import { idFilter } from './idFilter.js';
import { createPrice, findPriceById, priceFilter } from './priceDocuments.js';
import { deleteById } from './revisionWrite.js';

/**
 * Commission rules (country, market, zone or goalkeeper), one per scope, reference and tier
 * (feature 033). The operating balance reads them through `ICommissionSettingRepository`; the
 * admin web writes them through `ICommissionAdmin` (spec 004 of the admin). A document written
 * before feature 033 carries `amount` instead of `fixedAmount`/`percentBps`; it is read as a fixed
 * rule until `scripts/migrate-033-commission-rules.ts` rewrites it.
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

  /** Every setting for any of these zones, markets, countries or goalkeepers, in one read. */
  async findFor(refs: { zoneIds: string[]; marketIds: string[]; countryIds: string[]; goalkeeperIds?: string[] }): Promise<CommissionSetting[]> {
    const goalkeeperIds = refs.goalkeeperIds ?? [];
    const or = [
      ...(refs.zoneIds.length > 0 ? [{ scope: 'zone', refId: { $in: refs.zoneIds } }] : []),
      ...(refs.marketIds.length > 0 ? [{ scope: 'market', refId: { $in: refs.marketIds } }] : []),
      ...(refs.countryIds.length > 0 ? [{ scope: 'country', refId: { $in: refs.countryIds } }] : []),
      ...(goalkeeperIds.length > 0 ? [{ scope: 'goalkeeper', refId: { $in: goalkeeperIds } }] : []),
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
      fixedAmount: (doc.fixedAmount as number | undefined) ?? (doc.amount as number | undefined),
      percentBps: (doc.percentBps as number | undefined) ?? 0,
      modality: (doc.modality as string | undefined) ?? null,
      countryId: (doc.countryId as string | undefined) ?? null,
      validUntil: (doc.validUntil as Date | undefined) ?? null,
      revision: doc.revision as number | undefined,
    });
  }

  /** The stored fields as they are, plus whether the domain accepts them. */
  private recordOf(doc: Document): CommissionRecord {
    let invalid = false;
    try {
      this.fromDocument(doc);
    } catch {
      invalid = true;
    }
    return {
      id: String(doc._id),
      scope: doc.scope as CommissionRecord['scope'],
      refId: String(doc.refId),
      modality: (doc.modality as PricedModality | undefined) ?? null,
      fixedAmount: (doc.fixedAmount as number | undefined) ?? (doc.amount as number | undefined) ?? 0,
      percentBps: (doc.percentBps as number | undefined) ?? 0,
      countryId: (doc.countryId as string | undefined) ?? null,
      validUntil: (doc.validUntil as Date | undefined) ?? null,
      revision: typeof doc.revision === 'number' ? doc.revision : 0,
      invalid,
    };
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
    const { id, scope, refId, modality, fixedAmount, percentBps, countryId, validUntil } = commission;
    const goalkeeperFields = scope === 'goalkeeper' ? { countryId, validUntil } : {};
    return createPrice(this.collection, id, { scope, refId, modality }, { fixedAmount, percentBps, ...goalkeeperFields });
  }

  /** Writes both components (and the validity when given) at the expected revision; a legacy `amount` is dropped. */
  async update(id: string, expectedRevision: number, fields: CommissionFields): Promise<UpdateResult> {
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const set: Document = { fixedAmount: fields.fixedAmount, percentBps: fields.percentBps };
    if (fields.validUntil !== undefined) set.validUntil = fields.validUntil;
    const result = await this.collection.updateOne({ ...idFilter(id), ...atRevision }, { $set: set, $unset: { amount: '' }, $inc: { revision: 1 } });
    return result.matchedCount > 0 ? 'saved' : 'stale';
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
