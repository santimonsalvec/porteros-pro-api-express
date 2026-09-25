import type { Collection, Db, Document } from 'mongodb';
import type { IRentalRateRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { RentalRate } from '../../../domain/pricing/rentalRate.js';

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
    await this.collection.createIndex(
      { scope: 1, refId: 1, durationMinutes: 1 },
      { name: 'scope_refId_durationMinutes', unique: true },
    );
  }

  private fromDocument(doc: Document): RentalRate {
    return new RentalRate({
      id: String(doc._id),
      scope: doc.scope as string,
      refId: String(doc.refId),
      durationMinutes: doc.durationMinutes as number,
      amount: doc.amount as number,
    });
  }

  async findForDuration(
    zoneId: string,
    cityId: string,
    durationMinutes: number,
  ): Promise<{ zone: RentalRate | null; city: RentalRate | null }> {
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
      zone: rates.find((rate) => rate.scope === 'zone') ?? null,
      city: rates.find((rate) => rate.scope === 'city') ?? null,
    };
  }
}
