import type { Db, Document } from 'mongodb';
import type { ContactFields, ContactWriteResult, IUserContactWriter } from '../../../application/features/users/common/ports.js';
import { EmailKeyTakenError, type IUserRepository } from '../../../application/features/auth/common/ports.js';
import { ExternalIdentity } from '../../../domain/users/externalIdentity.js';
import { User } from '../../../domain/users/user.js';
import { dropIndexIfExists } from './dropIndexIfExists.js';
import { MongoRepository } from './mongoRepository.js';
import { stripNulls } from './stripNulls.js';

/**
 * Accounts migrated from the legacy .NET backend still store `createdAt` as that
 * driver's default `DateTimeOffset` shape (`{ DateTime, Ticks, Offset }`) rather than
 * a plain BSON date, since migrated documents were never rewritten by this backend.
 */
function parseCreatedAt(raw: unknown): Date {
  if (raw && typeof raw === 'object' && 'DateTime' in raw) {
    return new Date((raw as { DateTime: string | Date }).DateTime);
  }
  return new Date(raw as string | Date);
}

export class UserRepository extends MongoRepository<User, string> implements IUserRepository, IUserContactWriter {
  constructor(db: Db) {
    super(db.collection('users'));
  }

  /**
   * Compound unique on external identity; sparse unique on normalizedPhoneNumber (FR-013, FR-025);
   * unique on the proven email (admin spec 009). The identity index is partial: an account a
   * sign-in code created has no identity, and a non-partial unique index counts every such account
   * as the same `null` key. The partial one is built before the old one is dropped, so uniqueness
   * never lapses.
   */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex(
      { 'externalIdentities.provider': 1, 'externalIdentities.subject': 1 },
      {
        unique: true,
        name: 'externalIdentities_provider_subject_unique_partial',
        partialFilterExpression: { 'externalIdentities.subject': { $type: 'string' } },
      },
    );
    await dropIndexIfExists(this.collection, 'externalIdentities_provider_subject_unique');
    await this.collection.createIndex(
      { emailKey: 1 },
      { unique: true, name: 'emailKey_unique', partialFilterExpression: { emailKey: { $type: 'string' } } },
    );
    await this.collection.createIndex(
      { normalizedPhoneNumber: 1 },
      { unique: true, sparse: true, name: 'normalizedPhoneNumber_unique_sparse' },
    );
    // The admin's user list, newest first (admin spec 005).
    await this.collection.createIndex({ createdAt: -1, _id: -1 }, { name: 'createdAt_id' });
  }

  protected toDocument(entity: User): Document {
    return stripNulls({
      _id: entity.id,
      email: entity.email,
      displayName: entity.displayName,
      isAdmin: entity.isAdmin,
      externalIdentities: entity.externalIdentities.map((identity) => ({
        provider: identity.provider,
        subject: identity.subject,
        email: identity.email,
      })),
      createdAt: entity.createdAt,
      firstName: entity.firstName,
      lastName: entity.lastName,
      countryCallingCode: entity.countryCallingCode,
      whatsAppNumber: entity.whatsAppNumber,
      isProfileComplete: entity.isProfileComplete,
      normalizedPhoneNumber: entity.normalizedPhoneNumber,
      emailKey: entity.emailKey,
    });
  }

  protected fromDocument(doc: Document): User {
    const rawIdentities = (doc.externalIdentities as Array<{ provider: string; subject: string; email: string }>) ?? [];
    return new User({
      id: doc._id as string,
      email: doc.email as string,
      displayName: (doc.displayName as string | undefined) ?? null,
      isAdmin: Boolean(doc.isAdmin),
      externalIdentities: rawIdentities.map((i) => new ExternalIdentity(i.provider, i.subject, i.email)),
      createdAt: parseCreatedAt(doc.createdAt),
      firstName: (doc.firstName as string | undefined) ?? null,
      lastName: (doc.lastName as string | undefined) ?? null,
      countryCallingCode: (doc.countryCallingCode as string | undefined) ?? null,
      whatsAppNumber: (doc.whatsAppNumber as string | undefined) ?? null,
      isProfileComplete: Boolean(doc.isProfileComplete),
      normalizedPhoneNumber: (doc.normalizedPhoneNumber as string | undefined) ?? null,
      emailKey: (doc.emailKey as string | undefined) ?? null,
    });
  }

  override async add(entity: User): Promise<void> {
    try {
      await super.add(entity);
    } catch (error) {
      if (isEmailKeyDuplicate(error) && entity.emailKey) throw new EmailKeyTakenError(entity.emailKey);
      throw error;
    }
  }

  async findByEmailKey(emailKey: string): Promise<User | null> {
    const doc = await this.collection.findOne({ emailKey });
    return doc ? this.fromDocument(doc) : null;
  }

  async getByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const docs = await this.collection.find({ _id: { $in: ids } } as Document).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async findByExternalIdentity(provider: string, subject: string): Promise<User | null> {
    const doc = await this.collection.findOne({
      'externalIdentities.provider': provider,
      'externalIdentities.subject': subject,
    });
    return doc ? this.fromDocument(doc) : null;
  }

  /**
   * An administrator's correction (admin spec 005, research §9–§10): written only if the user still
   * has the values read (`null` also matches an absent field); the phone's unique index answers a
   * number another user took meanwhile.
   */
  async updateContactIfUnchanged(userId: string, expected: Omit<ContactFields, 'whatsAppNumber'>, next: ContactFields): Promise<ContactWriteResult> {
    try {
      const result = await this.collection.updateOne({ _id: userId, ...expected } as Document, { $set: { ...next } });
      return result.matchedCount > 0 ? 'saved' : 'stale';
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return 'duplicate';
      throw error;
    }
  }

  async existsByPhoneNumber(
    countryCallingCode: string,
    whatsAppNumber: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const normalized = User.normalizePhoneNumber(countryCallingCode, whatsAppNumber);
    const filter: Document = { normalizedPhoneNumber: normalized };
    if (excludeUserId) {
      filter._id = { $ne: excludeUserId };
    }
    const doc = await this.collection.findOne(filter);
    return doc !== null;
  }
}

function isEmailKeyDuplicate(error: unknown): boolean {
  const candidate = error as { code?: unknown; keyPattern?: Record<string, unknown>; message?: unknown };
  if (candidate?.code !== 11000) return false;
  return (candidate.keyPattern !== undefined && 'emailKey' in candidate.keyPattern) || String(candidate.message).includes('emailKey_unique');
}
