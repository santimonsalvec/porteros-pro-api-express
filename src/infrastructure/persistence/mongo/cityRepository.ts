import type { Collection, Db, Document } from 'mongodb';
import type { ICityRepository } from '../../../application/features/locations/common/ports.js';
import type { CityListQuery, Found, IAdminCityRepository, UpdateResult } from '../../../application/features/geography/common/ports.js';
import { idFilter } from './idFilter.js';
import { allOf, countBy, deleteById, escapeRegExp, prefixFilter, updateAtRevision } from './revisionWrite.js';
import { City } from '../../../domain/locations/city.js';

/**
 * Seeded in bulk by the data owner; the app only reads it (`ICityRepository`), and the admin web
 * edits single cities through `IAdminCityRepository` (admin spec 003).
 */
export class CityRepository implements ICityRepository, IAdminCityRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('cities');
  }

  /** Prefix index on `name` for the municipality search (billing, spec 031). */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ name: 1 }, { name: 'name_prefix' });
    // The admin lists thousands of cities by region (or by a country's regions).
    await this.collection.createIndex({ regionId: 1, name: 1 }, { name: 'region_name' });
  }

  private fromDocument(doc: Document): City {
    return new City({
      id: String(doc._id),
      name: doc.name as string,
      regionId: doc.regionId as string,
      // Seeded by the data owner, possibly as numbers: always read as text (leading zeros kept when stored as text).
      daneStateCode: doc.daneStateCode === undefined || doc.daneStateCode === null ? null : String(doc.daneStateCode),
      daneCityCode: doc.daneCityCode === undefined || doc.daneCityCode === null ? null : String(doc.daneCityCode),
      revision: doc.revision as number | undefined,
    });
  }

  private toFields(city: City): Document {
    return {
      name: city.name,
      regionId: city.regionId,
      daneStateCode: city.daneStateCode,
      daneCityCode: city.daneCityCode,
    };
  }

  async list(query: CityListQuery): Promise<Found<City>> {
    const clauses: Document[] = [];
    if (query.regionIds) clauses.push({ regionId: { $in: query.regionIds } });
    if (query.q) clauses.push(prefixFilter('name', query.q));
    const filter = allOf(clauses);
    const [docs, totalItems] = await Promise.all([
      this.collection
        .find(filter)
        .sort({ name: 1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .toArray(),
      this.collection.countDocuments(filter),
    ]);
    return { items: docs.map((doc) => this.fromDocument(doc)), totalItems };
  }

  countByRegion(regionIds: string[]): Promise<Map<string, number>> {
    return countBy(this.collection, 'regionId', regionIds);
  }

  async create(city: City): Promise<void> {
    await this.collection.insertOne({ _id: city.id, ...this.toFields(city), revision: 0 } as Document);
  }

  update(city: City): Promise<UpdateResult> {
    return updateAtRevision(this.collection, city.id, city.revision, this.toFields(city));
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }

  async getById(id: string): Promise<City | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? this.fromDocument(doc) : null;
  }

  async getByIds(ids: string[]): Promise<City[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async searchByName(query: string, limit: number): Promise<City[]> {
    const docs = await this.collection
      .find({ name: { $regex: escapeRegExp(query), $options: 'i' } })
      .limit(limit)
      .toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }
}
