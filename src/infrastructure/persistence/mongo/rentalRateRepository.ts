import type { Collection, Db, Document } from 'mongodb';
import type { IRatePresence } from '../../../application/features/geography/common/ports.js';
import type { IRentalRateRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type { CreateResult, IRentalRateAdmin, PriceFilter, RentalRateRecord } from '../../../application/features/pricing/common/ports.js';
import { RentalRate } from '../../../domain/pricing/rentalRate.js';
import { dropIndexIfExists } from './dropIndexIfExists.js';
import { createPrice, findPriceById, priceFilter, priceRecordOf } from './priceDocuments.js';
import { deleteById, updateAtRevision } from './revisionWrite.js';

/**
 * Read by the quote through `IRentalRateRepository`, which declares no writes: there a malformed
 * document throws (via the `RentalRate` constructor) rather than being skipped, so a bad price is
 * never silently ignored. The admin web writes it through `IRentalRateAdmin` (spec 004 of the admin).
 */
export class RentalRateRepository implements IRentalRateRepository, IRatePresence, IRentalRateAdmin {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('rentalRates');
  }

  async ensureIndexes(): Promise<void> {
    // Feature 024: one rate per modality/level tier, so the old unique index must go first.
    await dropIndexIfExists(this.collection, 'scope_refId_durationMinutes');
    await this.collection.createIndex(
      { scope: 1, refId: 1, durationMinutes: 1, modality: 1, level: 1 },
      { name: 'scope_refId_duration_modality_level', unique: true },
    );
  }

  private fromDocument(doc: Document): RentalRate {
    return new RentalRate({
      id: String(doc._id),
      scope: doc.scope as string,
      refId: String(doc.refId),
      durationMinutes: doc.durationMinutes as number,
      amount: doc.amount as number,
      modality: (doc.modality as string | undefined) ?? null,
      level: (doc.level as string | undefined) ?? null,
      revision: doc.revision as number | undefined,
    });
  }

  async findForDuration(
    zoneId: string,
    marketId: string,
    durationMinutes: number,
  ): Promise<{ zone: RentalRate[]; market: RentalRate[] }> {
    const docs = await this.collection
      .find({
        durationMinutes,
        $or: [
          { scope: 'zone', refId: zoneId },
          { scope: 'market', refId: marketId },
        ],
      })
      .toArray();
    const rates = docs.map((doc) => this.fromDocument(doc));
    return {
      zone: rates.filter((rate) => rate.scope === 'zone'),
      market: rates.filter((rate) => rate.scope === 'market'),
    };
  }

  /** Which durations have a rate for these refs; the indexed `scope`/`refId` pair serves it. */
  async pricedDurations(refs: { marketIds: string[]; zoneIds: string[] }): Promise<{ scope: 'market' | 'zone'; refId: string; durationMinutes: number }[]> {
    const or = [
      ...(refs.marketIds.length > 0 ? [{ scope: 'market', refId: { $in: refs.marketIds } }] : []),
      ...(refs.zoneIds.length > 0 ? [{ scope: 'zone', refId: { $in: refs.zoneIds } }] : []),
    ];
    if (or.length === 0) return [];
    const docs = await this.collection.find({ $or: or }, { projection: { scope: 1, refId: 1, durationMinutes: 1 } }).toArray();
    return docs.map((doc) => ({ scope: doc.scope as 'market' | 'zone', refId: String(doc.refId), durationMinutes: doc.durationMinutes as number }));
  }

  private recordOf(doc: Document): RentalRateRecord {
    return { ...priceRecordOf<'zone' | 'market'>(doc, (stored) => this.fromDocument(stored)), durationMinutes: doc.durationMinutes as number };
  }

  async find(filter: PriceFilter & { durationMinutes?: number }): Promise<RentalRateRecord[]> {
    const query = priceFilter(filter, filter.durationMinutes === undefined ? {} : { durationMinutes: filter.durationMinutes });
    if (query === null) return [];
    const docs = await this.collection.find(query).toArray();
    return docs.map((doc) => this.recordOf(doc));
  }

  async getById(id: string): Promise<RentalRateRecord | null> {
    const doc = await findPriceById(this.collection, id);
    return doc ? this.recordOf(doc) : null;
  }

  create(rate: Omit<RentalRateRecord, 'revision' | 'invalid'>): Promise<CreateResult> {
    const { id, scope, refId, durationMinutes, modality, level, amount } = rate;
    return createPrice(this.collection, id, { scope, refId, durationMinutes, modality, level }, amount);
  }

  updateAmount(id: string, expectedRevision: number, amount: number): Promise<UpdateResult> {
    return updateAtRevision(this.collection, id, expectedRevision, { amount });
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
