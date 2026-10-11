import type { Collection, Db, Document } from 'mongodb';
import type { ICountryRepository } from '../../../application/features/profile/common/ports.js';
import type { Found, IAdminCountryRepository, PageRequest, UpdateResult } from '../../../application/features/geography/common/ports.js';
import { idFilter } from './idFilter.js';
import { allOf, deleteById, escapeRegExp, prefixFilter, updateAtRevision } from './revisionWrite.js';
import { Country } from '../../../domain/countries/country.js';

function countryFromDocument(doc: Document): Country {
  return new Country({
    id: String(doc._id),
    name: doc.name as string,
    dialCode: doc.dialCode as string,
    countryCode: doc.countryCode as string,
    // Read as stored. A malformed value is rejected only where a currency is used (the quote
    // handler), so a bad value can't break the profile/country endpoints that share this repository.
    currency: (doc.currency as string | undefined | null) ?? null,
    revision: doc.revision as number | undefined,
  });
}

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
    return countryFromDocument(doc);
  }

  async getAll(): Promise<Country[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async getById(id: string): Promise<Country | null> {
    const doc = await this.collection.findOne(idFilter(id));
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

const COUNTRIES = 'countries';

const countryFields = (country: Country): Document => ({
  name: country.name,
  dialCode: country.dialCode,
  countryCode: country.countryCode,
  currency: country.currency,
});

/**
 * The admin web's side of `countries` (admin spec 003): a separate class because the older
 * `ICountryRepository` declares argument-less, throwing `update`/`delete`.
 */
export class MongoAdminCountryRepository implements IAdminCountryRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection(COUNTRIES);
  }

  async list(query: PageRequest & { q?: string }): Promise<Found<Country>> {
    const filter = allOf(query.q ? [prefixFilter('name', query.q)] : []);
    const [docs, totalItems] = await Promise.all([
      this.collection.find(filter).sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).toArray(),
      this.collection.countDocuments(filter),
    ]);
    return { items: docs.map(countryFromDocument), totalItems };
  }

  async getById(id: string): Promise<Country | null> {
    const doc = await this.collection.findOne(idFilter(id));
    return doc ? countryFromDocument(doc) : null;
  }

  async getByIds(ids: string[]): Promise<Country[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map(countryFromDocument);
  }

  async findByCode(countryCode: string): Promise<Country | null> {
    const doc = await this.collection.findOne({ countryCode: { $regex: `^${escapeRegExp(countryCode)}$`, $options: 'i' } });
    return doc ? countryFromDocument(doc) : null;
  }

  async create(country: Country): Promise<void> {
    await this.collection.insertOne({ _id: country.id, ...countryFields(country), revision: 0 } as Document);
  }

  update(country: Country): Promise<UpdateResult> {
    return updateAtRevision(this.collection, country.id, country.revision, countryFields(country));
  }

  delete(id: string): Promise<boolean> {
    return deleteById(this.collection, id);
  }
}
