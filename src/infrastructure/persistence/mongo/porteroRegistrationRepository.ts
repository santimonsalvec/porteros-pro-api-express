import type { Db, Document } from 'mongodb';
import type { IPorteroRegistrationRepository } from '../../../application/features/porteros/common/ports.js';
import { PorteroRegistration, type PorteroRegistrationStatus } from '../../../domain/porteros/porteroRegistration.js';
import { MongoRepository } from './mongoRepository.js';
import { stripNulls } from './stripNulls.js';

function toDateOrNull(value: unknown): Date | null {
  return value ? new Date(value as string | Date) : null;
}

export class PorteroRegistrationRepository
  extends MongoRepository<PorteroRegistration, string>
  implements IPorteroRegistrationRepository
{
  constructor(db: Db) {
    super(db.collection('porteroRegistrations'));
  }

  /**
   * One registration per client; a given identity document may only be registered
   * once (FR-023). Sparse so two registrations that both still have null document
   * fields never collide — `toDocument` omits null fields entirely via `stripNulls`
   * so they are genuinely *absent*, not stored as BSON null (see `stripNulls.ts`).
   */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ userId: 1 }, { unique: true, name: 'userId_unique' });
    await this.collection.createIndex(
      { 'identification.documentType': 1, 'identification.documentNumber': 1 },
      { unique: true, sparse: true, name: 'identification_document_unique_sparse' },
    );
  }

  protected toDocument(entity: PorteroRegistration): Document {
    return stripNulls({
      _id: entity.id,
      userId: entity.userId,
      status: entity.status,
      identification: stripNulls({ ...entity.identification }),
      physicalData: stripNulls({ ...entity.physicalData }),
      location: stripNulls({ ...entity.location }),
      availability: stripNulls({ ...entity.availability }),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      activatedAt: entity.activatedAt,
    });
  }

  protected fromDocument(doc: Document): PorteroRegistration {
    const identification = (doc.identification as Document | undefined) ?? {};
    const physicalData = (doc.physicalData as Document | undefined) ?? {};
    const location = (doc.location as Document | undefined) ?? {};
    const availability = (doc.availability as Document | undefined) ?? {};

    return new PorteroRegistration({
      id: doc._id as string,
      userId: doc.userId as string,
      status: doc.status as PorteroRegistrationStatus,
      identification: {
        documentType: (identification.documentType as string | undefined) ?? null,
        documentNumber: (identification.documentNumber as string | undefined) ?? null,
        issueDate: toDateOrNull(identification.issueDate),
        birthDate: toDateOrNull(identification.birthDate),
        documentPhotoAId: (identification.documentPhotoAId as string | undefined) ?? null,
        documentPhotoBId: (identification.documentPhotoBId as string | undefined) ?? null,
      },
      physicalData: {
        heightCm: (physicalData.heightCm as number | undefined) ?? null,
        weightKg: (physicalData.weightKg as number | undefined) ?? null,
      },
      location: {
        latitude: (location.latitude as number | undefined) ?? null,
        longitude: (location.longitude as number | undefined) ?? null,
        city: (location.city as string | undefined) ?? null,
        state: (location.state as string | undefined) ?? null,
        country: (location.country as string | undefined) ?? null,
        neighborhood: (location.neighborhood as string | undefined) ?? null,
        formattedAddress: (location.formattedAddress as string | undefined) ?? null,
      },
      availability: {
        radiusKm: (availability.radiusKm as number | undefined) ?? null,
      },
      createdAt: new Date(doc.createdAt as string | Date),
      updatedAt: new Date(doc.updatedAt as string | Date),
      activatedAt: toDateOrNull(doc.activatedAt),
    });
  }

  async getByUserId(userId: string): Promise<PorteroRegistration | null> {
    const doc = await this.collection.findOne({ userId });
    return doc ? this.fromDocument(doc) : null;
  }

  async existsByDocument(documentType: string, documentNumber: string, excludeUserId?: string): Promise<boolean> {
    const filter: Document = {
      'identification.documentType': documentType,
      'identification.documentNumber': documentNumber,
    };
    if (excludeUserId) {
      filter.userId = { $ne: excludeUserId };
    }
    const doc = await this.collection.findOne(filter);
    return doc !== null;
  }
}
