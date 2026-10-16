import type { Collection, Db, Document } from 'mongodb';
import type {
  IAdminMarketRepository,
  MarketCreateResult,
  MarketDeleteResult,
  MarketUpdateResult,
} from '../../../application/features/markets/common/ports.js';
import { Market, type MarketStatus } from '../../../domain/markets/market.js';
import { idFilter } from './idFilter.js';
import { updateAtRevision } from './revisionWrite.js';

export const MARKETS_COLLECTION = 'markets';
const DUPLICATE_KEY = 11000;

const isDuplicate = (error: unknown) => (error as { code?: unknown }).code === DUPLICATE_KEY;

/** The markets (spec 031, data-model §1): written by the admin web, read everywhere else. */
export class MarketRepository implements IAdminMarketRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(MARKETS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ countryId: 1, nameKey: 1 }, { name: 'country_name_unique', unique: true });
    await this.collection.createIndex({ status: 1, name: 1 }, { name: 'status' });
  }

  async getById(id: string): Promise<Market | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? fromDocument(doc) : null;
  }

  async getByIds(ids: readonly string[]): Promise<Market[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: [...ids] } } as Document).toArray();
    return docs.map(fromDocument);
  }

  async list(): Promise<Market[]> {
    return (await this.collection.find({}, { sort: { name: 1 } }).toArray()).map(fromDocument);
  }

  async listByCountry(countryId: string): Promise<Market[]> {
    return (await this.collection.find({ countryId }, { sort: { name: 1 } }).toArray()).map(fromDocument);
  }

  async listEnabled(): Promise<Market[]> {
    return (await this.collection.find({ status: 'enabled' }, { sort: { name: 1 } }).toArray()).map(fromDocument);
  }

  async create(market: Market): Promise<MarketCreateResult> {
    const { id, ...props } = market.toProps();
    try {
      await this.collection.insertOne({ _id: id, ...props, nameKey: market.nameKey, revision: 0 } as Document);
      return 'created';
    } catch (error) {
      if (isDuplicate(error)) return 'name_taken';
      throw error;
    }
  }

  async update(market: Market, expectedRevision: number): Promise<MarketUpdateResult> {
    const props = market.toProps();
    // The country, the creation and the revision counter are never rewritten (FR-001a).
    const fields = {
      name: props.name,
      nameKey: market.nameKey,
      timeZone: props.timeZone,
      mapCenter: props.mapCenter,
      status: props.status,
      enabledAt: props.enabledAt,
      enabledBy: props.enabledBy,
      disabledAt: props.disabledAt,
      disabledBy: props.disabledBy,
      updatedAt: props.updatedAt,
    };
    try {
      return await updateAtRevision(this.collection, props.id, expectedRevision, fields);
    } catch (error) {
      if (isDuplicate(error)) return 'name_taken';
      throw error;
    }
  }

  async delete(id: string, expectedRevision: number): Promise<MarketDeleteResult> {
    const atRevision = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision };
    const result = await this.collection.deleteOne({ ...idFilter(id), ...atRevision });
    if (result.deletedCount > 0) return 'deleted';
    return (await this.collection.findOne(idFilter(id))) ? 'stale' : 'not_found';
  }
}

const dateOrNull = (value: unknown) => (value instanceof Date ? value : null);

function fromDocument(doc: Document): Market {
  const center = (doc.mapCenter ?? {}) as { lat?: number; lng?: number; zoom?: number };
  return Market.fromStored({
    id: String(doc._id),
    name: String(doc.name),
    countryId: String(doc.countryId),
    timeZone: String(doc.timeZone),
    mapCenter: { lat: Number(center.lat), lng: Number(center.lng), zoom: Number(center.zoom) },
    status: doc.status as MarketStatus,
    enabledAt: dateOrNull(doc.enabledAt),
    enabledBy: (doc.enabledBy as string | null | undefined) ?? null,
    disabledAt: dateOrNull(doc.disabledAt),
    disabledBy: (doc.disabledBy as string | null | undefined) ?? null,
    createdAt: doc.createdAt as Date,
    createdBy: String(doc.createdBy),
    updatedAt: doc.updatedAt as Date,
    revision: doc.revision as number | undefined,
  });
}
