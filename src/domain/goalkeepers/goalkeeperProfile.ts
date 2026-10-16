import { Entity } from '../common/entity.js';
import { EMPTY_BILLING, type BillingData } from './billing.js';
import type { GoalkeeperRegistration } from './goalkeeperRegistration.js';
import { PENDING_VETTING, vettingTier, type Vetting, type VettingTier } from './vetting.js';

/**
 * The active, permanent record establishing a client as a discoverable goalkeeper
 * (spec Key Entities), created from a `GoalkeeperRegistration`'s completed data at the
 * moment of activation. Identification data (document, photos) is immutable. The
 * physical data and availability (market + zones) stay editable after activation, but
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
  /** The one market the goalkeeper plays in (spec 031, FR-022). */
  readonly marketId: string;
  readonly zoneIds: string[];
  /** Where the goalkeeper lives, for their invoices (spec 031, FR-023); editable from the profile. */
  readonly billing: BillingData;
  /** The last market change, informative (spec 031). */
  readonly marketChangedAt: Date | null;
  readonly activatedAt: Date;
  /** While in the future, the goalkeeper sees no offers and cannot accept (read by 012, written by 018). */
  readonly suspendedUntil: Date | null;
  /**
   * The goalkeeper's "available for offers" switch (feature 015). Off: no offers, no available
   * matches and no accepting. Absent in stored documents means on.
   */
  readonly availableForOffers: boolean;
  /** Validation and verification (admin spec 030). Absent means pending: nobody reviewed it yet. */
  readonly vetting: Vetting;

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
    marketId: string;
    zoneIds: string[];
    billing?: BillingData;
    marketChangedAt?: Date | null;
    activatedAt: Date;
    suspendedUntil?: Date | null;
    availableForOffers?: boolean;
    vetting?: Vetting;
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
    this.marketId = params.marketId;
    this.zoneIds = params.zoneIds;
    this.billing = { ...(params.billing ?? EMPTY_BILLING) };
    this.marketChangedAt = params.marketChangedAt ?? null;
    this.activatedAt = params.activatedAt;
    this.suspendedUntil = params.suspendedUntil ?? null;
    this.availableForOffers = params.availableForOffers ?? true;
    this.vetting = params.vetting ?? PENDING_VETTING;
  }

  /** Unvalidated, validated or verified — derived, never stored (research §1). */
  get tier(): VettingTier {
    return vettingTier(this.vetting);
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
      marketId: availability.marketId!,
      zoneIds: availability.zoneIds,
      billing: { ...registration.billing },
      activatedAt: new Date(),
      // A new goalkeeper starts off offers and switches them on when ready.
      availableForOffers: false,
      // Activation no longer gives access to matches: the team validates first (admin spec 030).
      vetting: PENDING_VETTING,
    });
  }
}
