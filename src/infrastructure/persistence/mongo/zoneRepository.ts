import type { Collection, Db, Document } from 'mongodb';
import type { IZoneRepository } from '../../../application/features/zones/common/ports.js';
import type { IAdminZoneRepository, UpdateResult, ZoneSummary } from '../../../application/features/geography/common/ports.js';
import { readRevision } from '../../../domain/common/revision.js';
import { idFilter } from './idFilter.js';
import { countBy, deleteById, updateAtRevision } from './revisionWrite.js';
import { Zone, type ZoneGeometry } from '../../../domain/zones/zone.js';

/** Seeded by the data owner; the app reads it, and the admin web draws and edits zones (admin spec 003). */
export class ZoneRepository implements IZoneRepository, IAdminZoneRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('zones');
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ cityId: 1, active: 1, displayOrder: 1 }, { name: 'cityId_active_displayOrder' });
  }

  private fromDocument(doc: Document): Zone {
    return new Zone({
      id: String(doc._id),
      cityId: doc.cityId as string,
      name: doc.name as string,
      slug: doc.slug as string,
      geometry: doc.geometry as ZoneGeometry,
      active: doc.active as boolean,
      displayOrder: doc.displayOrder as number,
      revision: doc.revision as number | undefined,
    });
  }

  async getActiveByCityId(anchorCityId: string): Promise<Zone[]> {
    const docs = await this.collection
      .find({ cityId: anchorCityId, active: true })
      .sort({ displayOrder: 1 })
      .toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async getManyByIds(ids: string[]): Promise<Zone[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>> {
    if (anchorCityIds.length === 0) return new Set();
    const cityIds = await this.collection.distinct('cityId', { cityId: { $in: anchorCityIds }, active: true });
    return new Set(cityIds as string[]);
  }

  async getCityIdsWithActiveZones(): Promise<string[]> {
    return (await this.collection.distinct('cityId', { active: true })) as string[];
  }

  /**
   * `$geoIntersects` needs no geospatial index, so this works against the unindexed
   * collection. This class deliberately does NOT create a `2dsphere` index in
   * `ensureIndexes()`: building one fails if any stored polygon is invalid, which would
   * stop the API from starting over a data problem in an externally-owned collection.
   * GeoJSON coordinates are `[longitude, latitude]`.
   */
  async findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null> {
    const docs = await this.collection
      .find({
        active: true,
        geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [longitude, latitude] } } },
      })
      .sort({ displayOrder: 1, _id: 1 })
      .limit(1)
      .toArray();
    const first = docs[0];
    return first ? this.fromDocument(first) : null;
  }

  /** The editable fields; `cityId` never changes after a zone is created. */
  private toFields(zone: Zone): Document {
    return { name: zone.name, slug: zone.slug, geometry: zone.geometry, active: zone.active, displayOrder: zone.displayOrder };
  }

  async listByCity(cityId: string): Promise<Zone[]> {
    const docs = await this.collection.find({ cityId }).sort({ displayOrder: 1, _id: 1 }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async summariesByCities(cityIds: string[]): Promise<ZoneSummary[]> {
    if (cityIds.length === 0) return [];
    const docs = await this.collection.find({ cityId: { $in: cityIds } }, { projection: { geometry: 0 } }).sort({ displayOrder: 1, _id: 1 }).toArray();
    return docs.map((doc) => ({
      id: String(doc._id),
      cityId: doc.cityId as string,
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

  countByCity(cityIds: string[]): Promise<Map<string, number>> {
    return countBy(this.collection, 'cityId', cityIds);
  }

  async zoneOwnerIds(): Promise<string[]> {
    return ((await this.collection.distinct('cityId')) as unknown[]).map(String);
  }

  async create(zone: Zone): Promise<void> {
    await this.collection.insertOne({ _id: zone.id, cityId: zone.cityId, ...this.toFields(zone), revision: 0 } as Document);
  }

  update(zone: Zone): Promise<UpdateResult> {
    return updateAtRevision(this.collection, zone.id, zone.revision, this.toFields(zone));
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
