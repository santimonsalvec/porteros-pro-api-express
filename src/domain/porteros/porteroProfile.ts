import { Entity } from '../common/entity.js';
import type { PorteroRegistration } from './porteroRegistration.js';

/**
 * The active, permanent record establishing a client as a discoverable portero
 * (spec Key Entities), created from a `PorteroRegistration`'s completed data at the
 * moment of activation. No mutating methods — updating an active profile is out of
 * scope for this feature (spec Assumptions).
 */
export class PorteroProfile extends Entity<string> {
  readonly userId: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly issueDate: Date;
  readonly birthDate: Date;
  readonly documentPhotoAId: string;
  readonly documentPhotoBId: string;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly neighborhood: string | null;
  readonly formattedAddress: string | null;
  readonly radiusKm: number;
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
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
    neighborhood: string | null;
    formattedAddress: string | null;
    radiusKm: number;
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
    this.latitude = params.latitude;
    this.longitude = params.longitude;
    this.city = params.city;
    this.state = params.state;
    this.country = params.country;
    this.neighborhood = params.neighborhood;
    this.formattedAddress = params.formattedAddress;
    this.radiusKm = params.radiusKm;
    this.activatedAt = params.activatedAt;
  }

  /** The only constructor — reads every field off a registration whose completeness has already been confirmed by the caller. */
  static createFromRegistration(id: string, registration: PorteroRegistration): PorteroProfile {
    const { identification, physicalData, location, availability } = registration;
    return new PorteroProfile({
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
      latitude: location.latitude!,
      longitude: location.longitude!,
      city: location.city!,
      state: location.state!,
      country: location.country!,
      neighborhood: location.neighborhood,
      formattedAddress: location.formattedAddress,
      radiusKm: availability.radiusKm!,
      activatedAt: new Date(),
    });
  }
}
