import { Entity } from '../common/entity.js';
import type { GoalkeeperRegistration } from './goalkeeperRegistration.js';

/**
 * The active, permanent record establishing a client as a discoverable goalkeeper
 * (spec Key Entities), created from a `GoalkeeperRegistration`'s completed data at the
 * moment of activation. Identification data (document, photos) is immutable. The
 * physical data and availability (city + zones) stay editable after activation, but
 * only through `IGoalkeeperProfileRepository`'s targeted updates (which write straight
 * to the stored document), never by mutating this in-memory instance.
 */
export class GoalkeeperProfile extends Entity<string> {
  readonly userId: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly issueDate: Date;
  readonly birthDate: Date;
  readonly documentPhotoAId: string;
  readonly documentPhotoBId: string;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly cityId: string;
  readonly zoneIds: string[];
  readonly activatedAt: Date;

  constructor(params: {
    id: string;
    userId: string;
    documentType: string;
    documentNumber: string;
    issueDate: Date;
    birthDate: Date;
    documentPhotoAId: string;
    documentPhotoBId: string;
    heightCm: number;
    weightKg: number;
    cityId: string;
    zoneIds: string[];
    activatedAt: Date;
  }) {
    super(params.id);
    this.userId = params.userId;
    this.documentType = params.documentType;
    this.documentNumber = params.documentNumber;
    this.issueDate = params.issueDate;
    this.birthDate = params.birthDate;
    this.documentPhotoAId = params.documentPhotoAId;
    this.documentPhotoBId = params.documentPhotoBId;
    this.heightCm = params.heightCm;
    this.weightKg = params.weightKg;
    this.cityId = params.cityId;
    this.zoneIds = params.zoneIds;
    this.activatedAt = params.activatedAt;
  }

  /** The only constructor — reads every field off a registration whose completeness has already been confirmed by the caller. */
  static createFromRegistration(id: string, registration: GoalkeeperRegistration): GoalkeeperProfile {
    const { identification, physicalData, availability } = registration;
    return new GoalkeeperProfile({
      id,
      userId: registration.userId,
      documentType: identification.documentType!,
      documentNumber: identification.documentNumber!,
      issueDate: identification.issueDate!,
      birthDate: identification.birthDate!,
      documentPhotoAId: identification.documentPhotoAId!,
      documentPhotoBId: identification.documentPhotoBId!,
      heightCm: physicalData.heightCm!,
      weightKg: physicalData.weightKg!,
      cityId: availability.cityId!,
      zoneIds: availability.zoneIds,
      activatedAt: new Date(),
    });
  }
}
