import type { Db, Document } from 'mongodb';
import type { IUserRepository } from '../../../application/features/auth/common/ports.js';
import { ExternalIdentity } from '../../../domain/users/externalIdentity.js';
import { User } from '../../../domain/users/user.js';
import { MongoRepository } from './mongoRepository.js';
import { stripNulls } from './stripNulls.js';

export class UserRepository extends MongoRepository<User, string> implements IUserRepository {
  constructor(db: Db) {
    super(db.collection('users'));
  }

  /** Compound unique on external identity; sparse unique on normalizedPhoneNumber (FR-013, FR-025). */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex(
      { 'externalIdentities.provider': 1, 'externalIdentities.subject': 1 },
      { unique: true, name: 'externalIdentities_provider_subject_unique' },
    );
    await this.collection.createIndex(
      { normalizedPhoneNumber: 1 },
      { unique: true, sparse: true, name: 'normalizedPhoneNumber_unique_sparse' },
    );
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
      createdAt: new Date(doc.createdAt as string | Date),
      firstName: (doc.firstName as string | undefined) ?? null,
      lastName: (doc.lastName as string | undefined) ?? null,
      countryCallingCode: (doc.countryCallingCode as string | undefined) ?? null,
      whatsAppNumber: (doc.whatsAppNumber as string | undefined) ?? null,
      isProfileComplete: Boolean(doc.isProfileComplete),
      normalizedPhoneNumber: (doc.normalizedPhoneNumber as string | undefined) ?? null,
    });
  }

  async findByExternalIdentity(provider: string, subject: string): Promise<User | null> {
    const doc = await this.collection.findOne({
      'externalIdentities.provider': provider,
      'externalIdentities.subject': subject,
    });
    return doc ? this.fromDocument(doc) : null;
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
