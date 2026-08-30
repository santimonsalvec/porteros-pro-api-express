import type { Collection, Db, Document } from 'mongodb';
import type { ICountryRepository } from '../../../application/features/profile/common/ports.js';
import { Country } from '../../../domain/countries/country.js';

/**
 * Pre-existing, externally-owned collection (capitalization `Countries` preserved
 * exactly). Reads raw BSON documents rather than a typed collection, tolerating the
 * `_id` as either an `ObjectId` or a `string` since this system doesn't own or seed
 * it. Write operations are rejected — this system only ever reads country data.
 */
export class CountryRepository implements ICountryRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('Countries');
  }

  private fromDocument(doc: Document): Country {
    return new Country({
      id: String(doc._id),
      name: doc.name as string,
      dialCode: doc.dialCode as string,
      countryCode: doc.countryCode as string,
    });
  }

  async getAll(): Promise<Country[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async getById(id: string): Promise<Country | null> {
    const doc = await this.collection.findOne({ _id: id } as Document);
    return doc ? this.fromDocument(doc) : null;
  }

  async findByCountryCode(countryCode: string): Promise<Country | null> {
    const doc = await this.collection.findOne({ countryCode });
    return doc ? this.fromDocument(doc) : null;
  }

  async add(): Promise<void> {
    throw new Error('Country reference data is read-only in this system.');
  }

  async update(): Promise<void> {
    throw new Error('Country reference data is read-only in this system.');
  }

  async delete(): Promise<void> {
    throw new Error('Country reference data is read-only in this system.');
  }
}
