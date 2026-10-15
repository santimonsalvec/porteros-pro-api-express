import type { Collection, Db, Document } from 'mongodb';
import type { DiscountCreateResult, DiscountDeleteResult, IUnverifiedDiscountRepository, UnverifiedFields } from '../../../application/features/pricing/common/ports.js';
import { UnverifiedDiscountSetting } from '../../../domain/pricing/unverifiedDiscount.js';
import { updateAtRevision } from './revisionWrite.js';
import { idFilter } from './idFilter.js';

const DUPLICATE_KEY = 11000;

/** How goalkeepers without the seal are treated, per country, anchor city or zone (admin spec 030). */
export class UnverifiedDiscountRepository implements IUnverifiedDiscountRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('unverifiedDiscounts');
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ scope: 1, refId: 1 }, { name: 'scope_ref_unique', unique: true });
  }

  async findFor(refs: { zoneIds: string[]; cityIds: string[]; countryIds: string[] }): Promise<UnverifiedDiscountSetting[]> {
    const or = [
      ...(refs.zoneIds.length > 0 ? [{ scope: 'zone', refId: { $in: refs.zoneIds } }] : []),
      ...(refs.cityIds.length > 0 ? [{ scope: 'city', refId: { $in: refs.cityIds } }] : []),
      ...(refs.countryIds.length > 0 ? [{ scope: 'country', refId: { $in: refs.countryIds } }] : []),
    ];
    if (or.length === 0) return [];
    const docs = await this.collection.find({ $or: or }).toArray();
    return docs.map(fromDocument);
  }

  async getById(id: string): Promise<UnverifiedDiscountSetting | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? fromDocument(doc) : null;
  }

  async create(setting: { id: string; scope: string; refId: string } & UnverifiedFields): Promise<DiscountCreateResult> {
    const { id, scope, refId, discountBps, verifiedPriorityMinutes } = setting;
    try {
      await this.collection.insertOne({ _id: id, scope, refId, discountBps, verifiedPriorityMinutes, revision: 0 } as Document);
      return { outcome: 'created' };
    } catch (error) {
      if ((error as { code?: unknown }).code !== DUPLICATE_KEY) throw error;
      const existing = await this.collection.findOne({ scope, refId }, { projection: { _id: 1 } });
      return { outcome: 'duplicate', existingId: existing ? String(existing._id) : null };
    }
  }

  update(id: string, expectedRevision: number, fields: UnverifiedFields): Promise<'saved' | 'stale'> {
    return updateAtRevision(this.collection, id, expectedRevision, { discountBps: fields.discountBps, verifiedPriorityMinutes: fields.verifiedPriorityMinutes });
  }

  async delete(id: string, expectedRevision: number): Promise<DiscountDeleteResult> {
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const result = await this.collection.deleteOne({ ...idFilter(id), ...atRevision });
    if (result.deletedCount > 0) return 'deleted';
    return (await this.collection.findOne(idFilter(id))) ? 'stale' : 'not_found';
  }
}

function fromDocument(doc: Document): UnverifiedDiscountSetting {
  return new UnverifiedDiscountSetting({
    id: String(doc._id),
    scope: doc.scope as string,
    refId: String(doc.refId),
    discountBps: (doc.discountBps as number | null | undefined) ?? null,
    verifiedPriorityMinutes: (doc.verifiedPriorityMinutes as number | null | undefined) ?? null,
    revision: doc.revision as number | undefined,
  });
}
