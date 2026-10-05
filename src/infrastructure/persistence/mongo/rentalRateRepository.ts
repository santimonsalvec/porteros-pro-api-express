import type { Collection, Db, Document } from 'mongodb';
import type { IRentalRateRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { RentalRate } from '../../../domain/pricing/rentalRate.js';
import { dropIndexIfExists } from './dropIndexIfExists.js';

/**
 * Externally seeded collection — this system only reads it, so the port declares no
 * write methods at all. A malformed document throws (via the `RentalRate` constructor)
 * rather than being skipped, so a bad price is never silently ignored.
 */
export class RentalRateRepository implements IRentalRateRepository {
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
    });
  }

  async findForDuration(
    zoneId: string,
    cityId: string,
    durationMinutes: number,
  ): Promise<{ zone: RentalRate[]; city: RentalRate[] }> {
    const docs = await this.collection
      .find({
        durationMinutes,
        $or: [
          { scope: 'zone', refId: zoneId },
          { scope: 'city', refId: cityId },
        ],
      })
      .toArray();
    const rates = docs.map((doc) => this.fromDocument(doc));
    return {
      zone: rates.filter((rate) => rate.scope === 'zone'),
      city: rates.filter((rate) => rate.scope === 'city'),
    };
  }
}
