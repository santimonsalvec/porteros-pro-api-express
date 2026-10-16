import type { Db, Document } from 'mongodb';
import type { IGoalkeeperProfileRepository } from '../../../application/features/goalkeepers/common/ports.js';
import { GoalkeeperProfile } from '../../../domain/goalkeepers/goalkeeperProfile.js';
import { PENDING_VETTING, type Verification, type Vetting } from '../../../domain/goalkeepers/vetting.js';
import { MongoRepository } from './mongoRepository.js';
import { stripNulls } from './stripNulls.js';
import { readBilling } from './goalkeeperRegistrationRepository.js';
import type { BillingData } from '../../../domain/goalkeepers/billing.js';

export class GoalkeeperProfileRepository extends MongoRepository<GoalkeeperProfile, string> implements IGoalkeeperProfileRepository {
  constructor(db: Db) {
    super(db.collection('goalkeeperProfiles'));
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ userId: 1 }, { unique: true, name: 'userId_unique' });
    await this.collection.createIndex({ zoneIds: 1, availableForOffers: 1 }, { name: 'zone_offers' });
    // The admin's goalkeeper list by market (admin spec 005).
    await this.collection.createIndex({ marketId: 1, activatedAt: -1 }, { name: 'market_activatedAt' });
    // The admin's goalkeeper list filtered by validation state (admin spec 030).
    await this.collection.createIndex({ 'vetting.validation': 1, activatedAt: -1, _id: -1 }, { name: 'vetting_validation_activatedAt' });
  }

  protected toDocument(entity: GoalkeeperProfile): Document {
    return stripNulls({
      _id: entity.id,
      userId: entity.userId,
      documentType: entity.documentType,
      documentNumber: entity.documentNumber,
      issueDate: entity.issueDate,
      birthDate: entity.birthDate,
      documentPhotoAId: entity.documentPhotoAId,
      documentPhotoBId: entity.documentPhotoBId,
      heightCm: entity.heightCm,
      weightKg: entity.weightKg,
      marketId: entity.marketId,
      zoneIds: entity.zoneIds,
      billing: stripNulls({ ...entity.billing }),
      marketChangedAt: entity.marketChangedAt,
      activatedAt: entity.activatedAt,
      suspendedUntil: entity.suspendedUntil,
      availableForOffers: entity.availableForOffers,
      vetting: entity.vetting,
    });
  }

  protected fromDocument(doc: Document): GoalkeeperProfile {
    return new GoalkeeperProfile({
      id: doc._id as string,
      userId: doc.userId as string,
      documentType: doc.documentType as string,
      documentNumber: doc.documentNumber as string,
      issueDate: new Date(doc.issueDate as string | Date),
      birthDate: new Date(doc.birthDate as string | Date),
      documentPhotoAId: doc.documentPhotoAId as string,
      documentPhotoBId: doc.documentPhotoBId as string,
      heightCm: doc.heightCm as number,
      weightKg: doc.weightKg as number,
      marketId: doc.marketId as string,
      zoneIds: (doc.zoneIds as string[] | undefined) ?? [],
      billing: readBilling(doc.billing as Document | undefined),
      marketChangedAt: doc.marketChangedAt ? new Date(doc.marketChangedAt as string | Date) : null,
      activatedAt: new Date(doc.activatedAt as string | Date),
      suspendedUntil: doc.suspendedUntil ? new Date(doc.suspendedUntil as string | Date) : null,
      // Absent on profiles activated before feature 015: on by default (FR-024).
      availableForOffers: doc.availableForOffers !== false,
      vetting: readVetting(doc.vetting),
    });
  }

  async getByUserId(userId: string): Promise<GoalkeeperProfile | null> {
    const doc = await this.collection.findOne({ userId });
    return doc ? this.fromDocument(doc) : null;
  }

  async updatePhysicalData(userId: string, fields: { heightCm?: number; weightKg?: number }): Promise<GoalkeeperProfile | null> {
    const changes = stripNulls({ heightCm: fields.heightCm, weightKg: fields.weightKg });
    // `$set` with no keys is rejected by MongoDB — nothing to change means nothing to write.
    if (Object.keys(changes).length === 0) return this.getByUserId(userId);
    return this.setFields(userId, changes);
  }

  async updateAvailability(userId: string, marketId: string, zoneIds: string[]): Promise<GoalkeeperProfile | null> {
    return this.setFields(userId, { marketId, zoneIds });
  }

  async updateBilling(userId: string, billing: BillingData): Promise<GoalkeeperProfile | null> {
    return this.setFields(userId, { billing: stripNulls({ ...billing }) });
  }

  async findOfferCandidates(zoneIds: readonly string[]): Promise<GoalkeeperProfile[]> {
    if (zoneIds.length === 0) return [];
    // `$ne: false` also matches profiles activated before the switch existed (on by default).
    const docs = await this.collection.find({ zoneIds: { $in: [...zoneIds] }, availableForOffers: { $ne: false } }).toArray();
    return docs.map((doc) => this.fromDocument(doc));
  }

  async setAvailableForOffers(userId: string, value: boolean): Promise<{ previous: boolean } | null> {
    const before = await this.collection.findOneAndUpdate(
      { userId },
      { $set: { availableForOffers: value } },
      { returnDocument: 'before' },
    );
    return before ? { previous: before.availableForOffers !== false } : null;
  }

  async updateVetting(userId: string, expectedRevision: number, vetting: Vetting): Promise<'saved' | 'stale'> {
    // A profile from before 030 has no vetting: it is at revision 0.
    const atRevision = expectedRevision === 0 ? { $or: [{ 'vetting.revision': 0 }, { vetting: { $exists: false } }] } : { 'vetting.revision': expectedRevision };
    const result = await this.collection.updateOne({ userId, ...atRevision }, { $set: { vetting } });
    return result.matchedCount > 0 ? 'saved' : 'stale';
  }

  /** `$set`s only the given keys, so writes to different fields of the same profile never overwrite each other. */
  private async setFields(userId: string, changes: Document): Promise<GoalkeeperProfile | null> {
    const doc = await this.collection.findOneAndUpdate({ userId }, { $set: changes }, { returnDocument: 'after' });
    return doc ? this.fromDocument(doc) : null;
  }
}

const toDate = (value: unknown): Date => new Date(value as string | Date);

/** Absent on profiles activated before admin spec 030: nobody reviewed them, so they are pending (research §2). */
function readVetting(raw: unknown): Vetting {
  if (!raw || typeof raw !== 'object') return PENDING_VETTING;
  const doc = raw as Document;
  const verification = doc.verification as Document | null | undefined;
  const rejection = doc.lastRejection as Document | null | undefined;
  return {
    validation: doc.validation === 'validated' ? 'validated' : 'pending',
    validatedAt: doc.validatedAt ? toDate(doc.validatedAt) : null,
    validatedBy: (doc.validatedBy as string | undefined) ?? null,
    lastRejection: rejection ? { reason: rejection.reason as string, at: toDate(rejection.at), by: rejection.by as string } : null,
    verification: verification
      ? {
          method: verification.method as Verification['method'],
          at: toDate(verification.at),
          by: verification.by as Verification['by'],
          details: verification.details as Verification['details'],
        }
      : null,
    autoVerificationBlocked: doc.autoVerificationBlocked === true,
    revision: typeof doc.revision === 'number' ? doc.revision : 0,
  };
}
