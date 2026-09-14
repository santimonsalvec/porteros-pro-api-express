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
      latitude: entity.latitude,
      longitude: entity.longitude,
      city: entity.city,
      state: entity.state,
      country: entity.country,
      neighborhood: entity.neighborhood,
      formattedAddress: entity.formattedAddress,
      radiusKm: entity.radiusKm,
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
      latitude: doc.latitude as number,
      longitude: doc.longitude as number,
      city: doc.city as string,
      state: doc.state as string,
      country: doc.country as string,
      neighborhood: (doc.neighborhood as string | undefined) ?? null,
      formattedAddress: (doc.formattedAddress as string | undefined) ?? null,
      radiusKm: doc.radiusKm as number,
      activatedAt: new Date(doc.activatedAt as string | Date),
    });
  }

  async getByUserId(userId: string): Promise<GoalkeeperProfile | null> {
    const doc = await this.collection.findOne({ userId });
    return doc ? this.fromDocument(doc) : null;
  }
}
