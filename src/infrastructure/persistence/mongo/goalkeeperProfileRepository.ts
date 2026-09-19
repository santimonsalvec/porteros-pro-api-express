import type { Db, Document } from 'mongodb';
import type { IGoalkeeperProfileRepository } from '../../../application/features/goalkeepers/common/ports.js';
import { GoalkeeperProfile } from '../../../domain/goalkeepers/goalkeeperProfile.js';
import { MongoRepository } from './mongoRepository.js';
import { stripNulls } from './stripNulls.js';

export class GoalkeeperProfileRepository extends MongoRepository<GoalkeeperProfile, string> implements IGoalkeeperProfileRepository {
  constructor(db: Db) {
    super(db.collection('goalkeeperProfiles'));
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ userId: 1 }, { unique: true, name: 'userId_unique' });
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
      cityId: entity.cityId,
      zoneIds: entity.zoneIds,
      activatedAt: entity.activatedAt,
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
      cityId: doc.cityId as string,
      zoneIds: (doc.zoneIds as string[] | undefined) ?? [],
      activatedAt: new Date(doc.activatedAt as string | Date),
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

  async updateAvailability(userId: string, cityId: string, zoneIds: string[]): Promise<GoalkeeperProfile | null> {
    return this.setFields(userId, { cityId, zoneIds });
  }

  /** `$set`s only the given keys, so writes to different fields of the same profile never overwrite each other. */
  private async setFields(userId: string, changes: Document): Promise<GoalkeeperProfile | null> {
    const doc = await this.collection.findOneAndUpdate({ userId }, { $set: changes }, { returnDocument: 'after' });
    return doc ? this.fromDocument(doc) : null;
  }
}
