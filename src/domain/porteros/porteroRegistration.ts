import { Entity } from '../common/entity.js';

export type PorteroRegistrationStatus = 'in_progress' | 'active';

export interface IdentificationSection {
  documentType: string | null;
  documentNumber: string | null;
  issueDate: Date | null;
  birthDate: Date | null;
  documentPhotoAId: string | null;
  documentPhotoBId: string | null;
}

export interface PhysicalDataSection {
  heightCm: number | null;
  weightKg: number | null;
}

export interface LocationSection {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  neighborhood: string | null;
  formattedAddress: string | null;
}

export interface AvailabilitySection {
  radiusKm: number | null;
}

/**
 * The temporary/draft record tracking one client's progressive path toward becoming
 * a portero (spec Key Entities). Its data-entry capability exists only up to
 * activation — the *handler*, not this entity, enforces that `status !== 'active'`
 * before calling any setter here (mirrors `User.completeProfile`/`updateProfile`).
 * Once activated it is retained, permanently locked, as a historical/audit trail
 * (`/speckit.clarify` 2026-08-30, Q3/Q5).
 */
export class PorteroRegistration extends Entity<string> {
  readonly userId: string;
  status: PorteroRegistrationStatus;
  identification: IdentificationSection;
  physicalData: PhysicalDataSection;
  location: LocationSection;
  availability: AvailabilitySection;
  readonly createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;

  constructor(params: {
    id: string;
    userId: string;
    status: PorteroRegistrationStatus;
    identification: IdentificationSection;
    physicalData: PhysicalDataSection;
    location: LocationSection;
    availability: AvailabilitySection;
    createdAt: Date;
    updatedAt: Date;
    activatedAt: Date | null;
  }) {
    super(params.id);
    this.userId = params.userId;
    this.status = params.status;
    this.identification = params.identification;
    this.physicalData = params.physicalData;
    this.location = params.location;
    this.availability = params.availability;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.activatedAt = params.activatedAt;
  }

  /** Factory for the first section save for a client — every section field starts null. */
  static createEmpty(id: string, userId: string): PorteroRegistration {
    const now = new Date();
    return new PorteroRegistration({
      id,
      userId,
      status: 'in_progress',
      identification: {
        documentType: null,
        documentNumber: null,
        issueDate: null,
        birthDate: null,
        documentPhotoAId: null,
        documentPhotoBId: null,
      },
      physicalData: { heightCm: null, weightKg: null },
      location: {
        latitude: null,
        longitude: null,
        city: null,
        state: null,
        country: null,
        neighborhood: null,
        formattedAddress: null,
      },
      availability: { radiusKm: null },
      createdAt: now,
      updatedAt: now,
      activatedAt: null,
    });
  }

  /** Merges only the provided keys — absent fields are left untouched (FR-002). */
  saveIdentification(fields: Partial<IdentificationSection>): void {
    Object.assign(this.identification, fields);
    this.updatedAt = new Date();
  }

  savePhysicalData(fields: Partial<PhysicalDataSection>): void {
    Object.assign(this.physicalData, fields);
    this.updatedAt = new Date();
  }

  saveLocation(fields: Partial<LocationSection>): void {
    Object.assign(this.location, fields);
    this.updatedAt = new Date();
  }

  saveAvailability(fields: Partial<AvailabilitySection>): void {
    Object.assign(this.availability, fields);
    this.updatedAt = new Date();
  }

  setDocumentPhoto(side: 'A' | 'B', imageId: string): void {
    if (side === 'A') this.identification.documentPhotoAId = imageId;
    else this.identification.documentPhotoBId = imageId;
    this.updatedAt = new Date();
  }

  /** Sets `status = 'active'` and `activatedAt`. The handler calls this only once completeness is confirmed. */
  activate(): void {
    this.status = 'active';
    this.activatedAt = new Date();
  }
}
