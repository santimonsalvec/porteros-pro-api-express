import { Entity } from '../common/entity.js';
import { EMPTY_BILLING, normalizedBilling, type BillingData } from './billing.js';

export type GoalkeeperRegistrationStatus = 'in_progress' | 'active';

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

export interface AvailabilitySection {
  /** The market the goalkeeper will play in (spec 031). */
  marketId: string | null;
  zoneIds: string[];
}

/**
 * The temporary/draft record tracking one client's progressive path toward becoming
 * a goalkeeper (spec Key Entities). Its data-entry capability exists only up to
 * activation — the *handler*, not this entity, enforces that `status !== 'active'`
 * before calling any setter here (mirrors `User.completeProfile`/`updateProfile`).
 * Once activated it is retained, permanently locked, as a historical/audit trail
 * (`/speckit.clarify` 2026-08-30, Q3/Q5).
 */
export class GoalkeeperRegistration extends Entity<string> {
  readonly userId: string;
  status: GoalkeeperRegistrationStatus;
  identification: IdentificationSection;
  physicalData: PhysicalDataSection;
  availability: AvailabilitySection;
  /** Where the goalkeeper lives, for their invoices (spec 031, FR-023). */
  billing: BillingData;
  readonly createdAt: Date;
  updatedAt: Date;
  activatedAt: Date | null;

  constructor(params: {
    id: string;
    userId: string;
    status: GoalkeeperRegistrationStatus;
    identification: IdentificationSection;
    physicalData: PhysicalDataSection;
    availability: AvailabilitySection;
    billing?: BillingData;
    createdAt: Date;
    updatedAt: Date;
    activatedAt: Date | null;
  }) {
    super(params.id);
    this.userId = params.userId;
    this.status = params.status;
    this.identification = params.identification;
    this.physicalData = params.physicalData;
    this.availability = params.availability;
    this.billing = { ...(params.billing ?? EMPTY_BILLING) };
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.activatedAt = params.activatedAt;
  }

  /** Factory for the first section save for a client — every section field starts null. */
  static createEmpty(id: string, userId: string): GoalkeeperRegistration {
    const now = new Date();
    return new GoalkeeperRegistration({
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
      availability: { marketId: null, zoneIds: [] },
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

  saveAvailability(fields: Partial<AvailabilitySection>): void {
    Object.assign(this.availability, fields);
    this.updatedAt = new Date();
  }

  /** Trimmed; an empty complement is stored as none. */
  saveBilling(fields: Partial<BillingData>): void {
    Object.assign(this.billing, normalizedBilling(fields));
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
