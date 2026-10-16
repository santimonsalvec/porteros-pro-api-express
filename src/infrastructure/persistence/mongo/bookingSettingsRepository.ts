import type { IBookingSettingsBatch } from '../../../application/features/geography/common/ports.js';
import type { Collection, Db, Document } from 'mongodb';
import type { IBookingSettingsRepository } from '../../../application/features/goalkeeperRequests/common/ports.js';
import type { UpdateResult } from '../../../application/features/geography/common/ports.js';
import type {
  BookingSettingsRecord,
  IBookingSettingsAdmin,
  StoredBookingSettings,
} from '../../../application/features/pricing/common/ports.js';
import type { CheckInWindowConfig } from '../../../domain/bookings/checkInWindow.js';
import type { GoalkeeperPenaltyConfig } from '../../../domain/goalkeepers/penaltyPolicy.js';
import { BookingSettings, type SurchargeTier } from '../../../domain/pricing/bookingSettings.js';

const DUPLICATE_KEY = 11000;

/** Every value one level may hold, in the order the admin web shows them. */
const FIELDS = [
  'bookingWindowDays',
  'minNoticeMinutes',
  'leadTimeSurcharge',
  'freeCancellationMinutes',
  'travelBufferMinutes',
  'goalkeeperPenalties',
  'checkInWindow',
  'noShowGraceMinutes',
  'offerReminderIntervalMinutes',
  'offerMaxReminders',
] as const satisfies readonly (keyof StoredBookingSettings)[];

/** A group's subfields without the empty ones: `{ opensMinutesBefore: 30 }`, never `closesMinutesAfter: null`. */
function stored(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || 'tiers' in value) return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

/**
 * Every setting on a document is optional (absent ⇒ inherit). The quote reads it through
 * `IBookingSettingsRepository`, where a malformed value throws via the `BookingSettings`
 * constructor; the admin web writes it through `IBookingSettingsAdmin` (spec 004 of the admin).
 */
export class BookingSettingsRepository implements IBookingSettingsRepository, IBookingSettingsBatch, IBookingSettingsAdmin {
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
      freeCancellationMinutes: (doc.freeCancellationMinutes as number | undefined | null) ?? null,
      travelBufferMinutes: (doc.travelBufferMinutes as number | undefined | null) ?? null,
      goalkeeperPenalties: (doc.goalkeeperPenalties as Partial<GoalkeeperPenaltyConfig> | undefined | null) ?? null,
      checkInWindow: (doc.checkInWindow as Partial<CheckInWindowConfig> | undefined | null) ?? null,
      noShowGraceMinutes: (doc.noShowGraceMinutes as number | undefined | null) ?? null,
      offerReminderIntervalMinutes: (doc.offerReminderIntervalMinutes as number | undefined | null) ?? null,
      offerMaxReminders: (doc.offerMaxReminders as number | undefined | null) ?? null,
      // Only the tiers are read: the currency is the country's. A leftover `currency` key inside
      // `leadTimeSurcharge` (from an earlier layout) is ignored.
      leadTimeSurcharge: doc.leadTimeSurcharge ? { tiers: doc.leadTimeSurcharge.tiers as SurchargeTier[] } : null,
      revision: doc.revision as number | undefined,
    });
  }

  async findFor(
    marketId: string,
    countryId: string | null,
  ): Promise<{ market: BookingSettings | null; country: BookingSettings | null }> {
    const docs = await this.collection
      .find({
        $or: [{ scope: 'market', refId: marketId }, ...(countryId !== null ? [{ scope: 'country', refId: countryId }] : [])],
      })
      .toArray();
    const settings = docs.map((doc) => this.fromDocument(doc));
    return {
      market: settings.find((item) => item.scope === 'market') ?? null,
      country: settings.find((item) => item.scope === 'country') ?? null,
    };
  }

  async findMany(refs: { marketIds: string[]; countryIds: string[] }): Promise<BookingSettings[]> {
    const or = [
      ...(refs.marketIds.length > 0 ? [{ scope: 'market', refId: { $in: refs.marketIds } }] : []),
      ...(refs.countryIds.length > 0 ? [{ scope: 'country', refId: { $in: refs.countryIds } }] : []),
    ];
    if (or.length === 0) return [];
    const docs = await this.collection.find({ $or: or }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  private recordOf(doc: Document): BookingSettingsRecord {
    let invalid = false;
    try {
      this.fromDocument(doc);
    } catch {
      invalid = true;
    }
    const fields = Object.fromEntries(FIELDS.map((field) => [field, (doc[field] as unknown) ?? null])) as StoredBookingSettings;
    return {
      scope: doc.scope as 'country' | 'market',
      refId: String(doc.refId),
      fields,
      revision: typeof doc.revision === 'number' ? doc.revision : 0,
      invalid,
    };
  }

  async getByScope(scope: 'country' | 'market', refId: string): Promise<BookingSettingsRecord | null> {
    const doc = await this.collection.findOne({ scope, refId });
    return doc ? this.recordOf(doc) : null;
  }

  async save(scope: 'country' | 'market', refId: string, expectedRevision: number | null, fields: StoredBookingSettings): Promise<UpdateResult> {
    const set = Object.fromEntries(FIELDS.filter((field) => fields[field] !== null).map((field) => [field, stored(fields[field])]));
    if (expectedRevision === null) {
      try {
        await this.collection.insertOne({ _id: `${scope}:${refId}`, scope, refId, ...set, revision: 0 } as Document);
        return 'saved';
      } catch (error) {
        if ((error as { code?: unknown }).code === DUPLICATE_KEY) return 'stale';
        throw error;
      }
    }
    const unset = Object.fromEntries(FIELDS.filter((field) => fields[field] === null).map((field) => [field, '']));
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const result = await this.collection.updateOne(
      { scope, refId, ...atRevision },
      { ...(Object.keys(set).length > 0 ? { $set: set } : {}), ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}), $inc: { revision: 1 } },
    );
    return result.matchedCount > 0 ? 'saved' : 'stale';
  }

  async listMarketScoped(): Promise<BookingSettingsRecord[]> {
    const docs = await this.collection.find({ scope: 'market' }).toArray();
    return docs.map((doc) => this.recordOf(doc));
  }
}
