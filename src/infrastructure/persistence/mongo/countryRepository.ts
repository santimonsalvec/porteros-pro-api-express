import type { Collection, Db, Document } from 'mongodb';
import type { ICountryRepository } from '../../../application/features/profile/common/ports.js';
import { Country } from '../../../domain/countries/country.js';

/**
 * Pre-existing, externally-owned collection. Reads raw BSON documents rather than a
 * typed collection, tolerating the `_id` as either an `ObjectId` or a `string` since
 * this system doesn't own or seed it. Write operations are rejected — this system
 * only ever reads country data.
 */
export class CountryRepository implements ICountryRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection('countries');
  }

  private fromDocument(doc: Document): Country {
    return new Country({
      id: String(doc._id),
      name: doc.name as string,
      dialCode: doc.dialCode as string,
      countryCode: doc.countryCode as string,
      // Read as stored. A malformed value is rejected only where a currency is used (the quote
      // handler), so a bad value can't break the profile/country endpoints that share this repository.
      currency: (doc.currency as string | undefined | null) ?? null,
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
