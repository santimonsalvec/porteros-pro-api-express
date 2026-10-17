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
    // Feature 024: one rate per modality tier, so the older unique indexes must go first. The
    // match level (amateur/tournament) was withdrawn: its rates are dropped, as the modality's
    // general rate now covers every match, and the index no longer includes it.
    await dropIndexIfExists(this.collection, 'scope_refId_durationMinutes');
    await dropIndexIfExists(this.collection, 'scope_refId_duration_modality_level');
    await this.collection.deleteMany({ level: { $ne: null } });
    await this.collection.createIndex(
      { scope: 1, refId: 1, durationMinutes: 1, modality: 1 },
      { name: 'scope_refId_duration_modality', unique: true },
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

  /** Every rate of these zones and markets, any duration: the "can see offers" threshold (feature 033). */
  async findForZones(zoneIds: readonly string[], marketIds: readonly string[]): Promise<RentalRate[]> {
    const or = [
      ...(zoneIds.length > 0 ? [{ scope: 'zone', refId: { $in: [...zoneIds] } }] : []),
      ...(marketIds.length > 0 ? [{ scope: 'market', refId: { $in: [...marketIds] } }] : []),
    ];
    if (or.length === 0) return [];
    const docs = await this.collection.find({ $or: or }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
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
    const { id, scope, refId, durationMinutes, modality, amount } = rate;
    return createPrice(this.collection, id, { scope, refId, durationMinutes, modality }, { amount });
  }

  updateAmount(id: string, expectedRevision: number, amount: number): Promise<UpdateResult> {
    return updateAtRevision(this.collection, id, expectedRevision, { amount });
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
