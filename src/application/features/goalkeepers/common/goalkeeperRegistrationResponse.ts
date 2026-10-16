import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import { computeGoalkeeperSections, type GoalkeeperSectionsView } from './goalkeeperSections.js';
import type { VettingTier } from '../../../../domain/goalkeepers/vetting.js';
import { isBillingComplete, type BillingData } from '../../../../domain/goalkeepers/billing.js';

/** Display data for the saved `marketId` (spec 031). */
export interface GoalkeeperMarketView {
  id: string;
  name: string;
}

/** The billing data; the names are resolved only on `GET /goalkeepers/me` (spec 031, contract A6). */
export interface GoalkeeperBillingView extends BillingData {
  cityName?: string | null;
  stateName?: string | null;
}

export interface GoalkeeperRegistrationResponse {
  status: 'not_started' | 'in_progress' | 'active';
  sections: GoalkeeperSectionsView;
  documentType: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  birthDate: string | null;
  documentPhotoASubmitted: boolean;
  documentPhotoBSubmitted: boolean;
  heightCm: number | null;
  weightKg: number | null;
  marketId: string | null;
  serviceZoneIds: string[];
  billing: GoalkeeperBillingView;
  /** The "available for offers" switch (feature 015); null unless the goalkeeper is active. */
  availableForOffers: boolean | null;
  /**
   * Resolved from `marketId`. Present (`null` when there is no saved market, or it no longer
   * resolves) only on `GET /goalkeepers/me`; the write endpoints omit it to avoid an extra
   * lookup on every autosave.
   */
  market?: GoalkeeperMarketView | null;
  /**
   * Where the goalkeeper stands with the team (admin spec 030, contracts A1); only on
   * `GET /goalkeepers/me` and only once active. Never who decided nor how they were verified.
   */
  vetting?: GoalkeeperVettingSummary;
}

export interface GoalkeeperVettingSummary {
  tier: VettingTier;
  rejection: { reason: string; at: string } | null;
  backgroundChecks: { pending: number; approved: number; rejected: number; expired: number };
  /** The discount range across the goalkeeper's zones while validated without the seal; null otherwise. */
  unverifiedDiscount: { minBps: number; maxBps: number } | null;
}

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Projects a `GoalkeeperRegistration` into the shape every `/goalkeepers/me` route
 * returns. The raw document-photo ids are deliberately never included (FR-021) — only
 * the booleans derived from them. `null` synthesizes the `not_started` shape with no
 * database write (research.md §10).
 */
export function toGoalkeeperRegistrationResponse(registration: GoalkeeperRegistration | null): GoalkeeperRegistrationResponse {
  if (!registration) {
    return {
      status: 'not_started',
      sections: computeGoalkeeperSections(null),
      documentType: null,
      documentNumber: null,
      issueDate: null,
      birthDate: null,
      documentPhotoASubmitted: false,
      documentPhotoBSubmitted: false,
      heightCm: null,
      weightKg: null,
      marketId: null,
      serviceZoneIds: [],
      billing: { cityId: null, address: null, addressComplement: null },
      availableForOffers: null,
    };
  }

  return {
    status: registration.status,
    sections: computeGoalkeeperSections(registration),
    documentType: registration.identification.documentType,
    documentNumber: registration.identification.documentNumber,
    issueDate: toIsoDate(registration.identification.issueDate),
    birthDate: toIsoDate(registration.identification.birthDate),
    documentPhotoASubmitted: registration.identification.documentPhotoAId !== null,
    documentPhotoBSubmitted: registration.identification.documentPhotoBId !== null,
    heightCm: registration.physicalData.heightCm,
    weightKg: registration.physicalData.weightKg,
    marketId: registration.availability.marketId,
    serviceZoneIds: registration.availability.zoneIds,
    billing: { ...registration.billing },
    availableForOffers: null,
  };
}

/**
 * Projects the permanent `GoalkeeperProfile` — the source of truth for an active
 * goalkeeper, since its physical data and availability can change after activation
 * while the locked `GoalkeeperRegistration` keeps the values as they were at activation.
 * Every section is complete by construction (activation requires it).
 */
export function toActiveGoalkeeperResponse(profile: GoalkeeperProfile): GoalkeeperRegistrationResponse {
  return {
    status: 'active',
    sections: {
      identification: { complete: true },
      physicalData: { complete: true },
      availability: { complete: true },
      billing: { complete: isBillingComplete(profile.billing) },
    },
    documentType: profile.documentType,
    documentNumber: profile.documentNumber,
    issueDate: toIsoDate(profile.issueDate),
    birthDate: toIsoDate(profile.birthDate),
    documentPhotoASubmitted: true,
    documentPhotoBSubmitted: true,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    marketId: profile.marketId,
    serviceZoneIds: profile.zoneIds,
    billing: { ...profile.billing },
    availableForOffers: profile.availableForOffers,
  };
}
