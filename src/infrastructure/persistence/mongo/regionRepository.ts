import type { Collection, Db, Document } from 'mongodb';
import type { IRegionRepository } from '../../../application/features/locations/common/ports.js';
import type { Found, IAdminRegionRepository, PageRequest, UpdateResult } from '../../../application/features/geography/common/ports.js';
import { idFilter } from './idFilter.js';
import { allOf, countBy, deleteById, prefixFilter, updateAtRevision } from './revisionWrite.js';
import { Region } from '../../../domain/locations/region.js';

/** Seeded in bulk by the data owner; the app reads it, and the admin web edits single regions (admin spec 003). */
export class RegionRepository implements IRegionRepository, IAdminRegionRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('regions');
  }

  /** The admin lists a country's regions, and resolves a country to its cities through them. */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ countryId: 1, name: 1 }, { name: 'country_name' });
  }

  async list(query: PageRequest & { countryId?: string; q?: string }): Promise<Found<Region>> {
    const clauses: Document[] = [];
    if (query.countryId) clauses.push({ countryId: query.countryId });
    if (query.q) clauses.push(prefixFilter('name', query.q));
    const filter = allOf(clauses);
    const [docs, totalItems] = await Promise.all([
      this.collection.find(filter).sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).toArray(),
      this.collection.countDocuments(filter),
    ]);
    return { items: docs.map((doc) => this.fromDocument(doc)), totalItems };
  }

  async getById(id: string): Promise<Region | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? this.fromDocument(doc) : null;
  }

  countByCountry(countryIds: string[]): Promise<Map<string, number>> {
    return countBy(this.collection, 'countryId', countryIds);
  }

  async create(region: Region): Promise<void> {
    await this.collection.insertOne({ _id: region.id, name: region.name, countryId: region.countryId, revision: 0 } as Document);
  }

  update(region: Region): Promise<UpdateResult> {
    return updateAtRevision(this.collection, region.id, region.revision, { name: region.name, countryId: region.countryId });
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }

  async getByCountry(countryId: string): Promise<Region[]> {
    const docs = await this.collection.find({ countryId } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  private fromDocument(doc: Document): Region {
    return new Region({
      id: String(doc._id),
      name: doc.name as string,
      countryId: doc.countryId === undefined || doc.countryId === null ? null : String(doc.countryId),
      revision: doc.revision as number | undefined,
    });
  }

  async getByIds(ids: string[]): Promise<Region[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }
}
