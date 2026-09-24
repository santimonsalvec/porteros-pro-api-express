import type { Collection, Db, Document } from 'mongodb';
import type { IBookingSettingsRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import { BookingSettings, type SurchargeTier } from '../../../domain/pricing/bookingSettings.js';

/**
 * Externally seeded collection — this system only reads it, so the port declares no
 * write methods at all. Every setting on a document is optional (absent ⇒ inherit);
 * a malformed value throws via the `BookingSettings` constructor.
 */
export class BookingSettingsRepository implements IBookingSettingsRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('bookingSettings');
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ scope: 1, refId: 1 }, { name: 'scope_refId', unique: true });
  }

  private fromDocument(doc: Document): BookingSettings {
    return new BookingSettings({
      id: String(doc._id),
      scope: doc.scope as string,
      refId: String(doc.refId),
      bookingWindowDays: (doc.bookingWindowDays as number | undefined | null) ?? null,
      minNoticeMinutes: (doc.minNoticeMinutes as number | undefined | null) ?? null,
      // Only the tiers are read: the currency is the country's. A leftover `currency` key inside
      // `leadTimeSurcharge` (from an earlier layout) is ignored.
      leadTimeSurcharge: doc.leadTimeSurcharge ? { tiers: doc.leadTimeSurcharge.tiers as SurchargeTier[] } : null,
    });
  }

  async findFor(
    cityId: string,
    countryId: string | null,
  ): Promise<{ city: BookingSettings | null; country: BookingSettings | null }> {
    const docs = await this.collection
      .find({
        $or: [{ scope: 'city', refId: cityId }, ...(countryId !== null ? [{ scope: 'country', refId: countryId }] : [])],
      })
      .toArray();
    const settings = docs.map((doc) => this.fromDocument(doc));
    return {
      city: settings.find((item) => item.scope === 'city') ?? null,
      country: settings.find((item) => item.scope === 'country') ?? null,
    };
  }
}
