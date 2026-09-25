import type { Collection, Db, Document } from 'mongodb';
import type { ICityRepository } from '../../../application/features/locations/common/ports.js';
import { City } from '../../../domain/locations/city.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pre-existing, externally-owned collection — this system only reads it (mirrors
 * `CountryRepository`). No `add`/`update`/`delete` — this port doesn't declare them
 * at all (research.md §1), unlike `ICountryRepository`'s throw-on-write shape.
 */
export class CityRepository implements ICityRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('cities');
  }

  /** Prefix/text index on `name` for search, plus an index to resolve anchors quickly. */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ name: 1 }, { name: 'name_prefix' });
    await this.collection.createIndex({ zoneCityId: 1 }, { name: 'zoneCityId' });
  }

  private fromDocument(doc: Document): City {
    // Read as-is: an invalid identifier is rejected only where a time zone is actually
    // used (the quote handler), so a bad value here can't break unrelated city endpoints.
    const timeZone = (doc.timeZone as string | undefined | null) ?? null;
    return new City({
      id: String(doc._id),
      name: doc.name as string,
      regionId: doc.regionId as string,
      zoneCityId: (doc.zoneCityId as string | undefined) ?? null,
      timeZone,
    });
  }

  async getById(id: string): Promise<City | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? this.fromDocument(doc) : null;
  }

  async searchByName(query: string, limit: number): Promise<City[]> {
    const docs = await this.collection
      .find({ name: { $regex: escapeRegExp(query), $options: 'i' } })
      .limit(limit)
      .toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }
}
