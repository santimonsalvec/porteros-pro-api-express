import type { Collection, Db, Document } from 'mongodb';
import type { IZoneRepository } from '../../../application/features/zones/common/ports.js';
import type { IAdminZoneRepository, UpdateResult, ZoneSummary } from '../../../application/features/geography/common/ports.js';
import { readRevision } from '../../../domain/common/revision.js';
import { idFilter } from './idFilter.js';
import { countBy, deleteById, updateAtRevision } from './revisionWrite.js';
import { Zone, type ZoneGeometry } from '../../../domain/zones/zone.js';

/** The zones of each market (spec 031): drawn and edited in the admin web, read by the app and the quote. */
export class ZoneRepository implements IZoneRepository, IAdminZoneRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('zones');
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ marketId: 1, active: 1, displayOrder: 1 }, { name: 'market_active_order' });
  }

  private fromDocument(doc: Document): Zone {
    return new Zone({
      id: String(doc._id),
      marketId: doc.marketId as string,
      name: doc.name as string,
      slug: doc.slug as string,
      geometry: doc.geometry as ZoneGeometry,
      active: doc.active as boolean,
      displayOrder: doc.displayOrder as number,
      revision: doc.revision as number | undefined,
    });
  }

  async getActiveByMarketId(marketId: string): Promise<Zone[]> {
    const docs = await this.collection
      .find({ marketId: marketId, active: true })
      .sort({ displayOrder: 1 })
      .toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async getManyByIds(ids: string[]): Promise<Zone[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async hasActiveZonesForMarketIds(marketIds: string[]): Promise<Set<string>> {
    if (marketIds.length === 0) return new Set();
    const found = await this.collection.distinct('marketId', { marketId: { $in: marketIds }, active: true });
    return new Set(found as string[]);
  }

  async getMarketIdsWithActiveZones(): Promise<string[]> {
    return (await this.collection.distinct('marketId', { active: true })) as string[];
  }

  /**
   * `$geoIntersects` needs no geospatial index, so this works against the unindexed
   * collection. This class deliberately does NOT create a `2dsphere` index in
   * `ensureIndexes()`: building one fails if any stored polygon is invalid, which would
   * stop the API from starting over a data problem in an externally-owned collection.
   * GeoJSON coordinates are `[longitude, latitude]`.
   */
  async findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null> {
    return this.firstContaining(latitude, longitude, true);
  }

  /** The same search among the inactive zones (spec 031, research §8). */
  async findAnyContainingPoint(latitude: number, longitude: number): Promise<Zone | null> {
    return this.firstContaining(latitude, longitude, false);
  }

  private async firstContaining(latitude: number, longitude: number, active: boolean): Promise<Zone | null> {
    const docs = await this.collection
      .find({
        active,
        geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [longitude, latitude] } } },
      })
      .sort({ displayOrder: 1, _id: 1 })
      .limit(1)
      .toArray();
    const first = docs[0];
    return first ? this.fromDocument(first) : null;
  }

  /** The editable fields; `marketId` never changes after a zone is created. */
  private toFields(zone: Zone): Document {
    return { name: zone.name, slug: zone.slug, geometry: zone.geometry, active: zone.active, displayOrder: zone.displayOrder };
  }

  async listByMarket(marketId: string): Promise<Zone[]> {
    const docs = await this.collection.find({ marketId }).sort({ displayOrder: 1, _id: 1 }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async listActive(): Promise<Zone[]> {
    const docs = await this.collection.find({ active: true }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async summariesByMarkets(marketIds: string[]): Promise<ZoneSummary[]> {
    if (marketIds.length === 0) return [];
    const docs = await this.collection.find({ marketId: { $in: marketIds } }, { projection: { geometry: 0 } }).sort({ displayOrder: 1, _id: 1 }).toArray();
    return docs.map((doc) => ({
      id: String(doc._id),
      marketId: doc.marketId as string,
      name: doc.name as string,
      slug: doc.slug as string,
      active: doc.active as boolean,
      displayOrder: doc.displayOrder as number,
      revision: readRevision(doc.revision, `zones document ${String(doc._id)}`),
    }));
  }

  async getById(id: string): Promise<Zone | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? this.fromDocument(doc) : null;
  }

  async findBySlug(slug: string): Promise<Zone | null> {
    const doc = await this.collection.findOne({ slug });
    return doc ? this.fromDocument(doc) : null;
  }

  countByMarket(marketIds: string[]): Promise<Map<string, number>> {
    return countBy(this.collection, 'marketId', marketIds);
  }

  async zoneOwnerIds(): Promise<string[]> {
    return ((await this.collection.distinct('marketId')) as unknown[]).map(String);
  }

  async create(zone: Zone): Promise<void> {
    await this.collection.insertOne({ _id: zone.id, marketId: zone.marketId, ...this.toFields(zone), revision: 0 } as Document);
  }

  update(zone: Zone): Promise<UpdateResult> {
    return updateAtRevision(this.collection, zone.id, zone.revision, this.toFields(zone));
  }

  async reorder(entries: { id: string; revision: number; displayOrder: number }[]): Promise<UpdateResult> {
    const result = await this.collection.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: { ...idFilter(entry.id), ...(entry.revision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: entry.revision }) },
          update: { $set: { displayOrder: entry.displayOrder }, $inc: { revision: 1 } },
        },
      })),
      { ordered: false },
    );
    return result.matchedCount === entries.length ? 'saved' : 'stale';
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
