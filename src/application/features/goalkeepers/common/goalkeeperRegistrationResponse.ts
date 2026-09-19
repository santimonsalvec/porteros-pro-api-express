import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import { computeGoalkeeperSections, type GoalkeeperSectionsView } from './goalkeeperSections.js';

/** Display data for the saved `cityId`; `region` is the region's name, same convention as `GET /api/locations/cities`. */
export interface GoalkeeperCityView {
  id: string;
  name: string;
  region: string;
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
  cityId: string | null;
  serviceZoneIds: string[];
  /**
   * Resolved from `cityId`. Present (`null` when there is no saved city, or it no longer
   * resolves) only on `GET /api/goalkeepers/me`; the write endpoints omit it to avoid
   * two extra lookups on every autosave.
   */
  city?: GoalkeeperCityView | null;
}

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Projects a `GoalkeeperRegistration` into the shape every `/api/goalkeepers/me` route
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
      cityId: null,
      serviceZoneIds: [],
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
    cityId: registration.availability.cityId,
    serviceZoneIds: registration.availability.zoneIds,
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
    },
    documentType: profile.documentType,
    documentNumber: profile.documentNumber,
    issueDate: toIsoDate(profile.issueDate),
    birthDate: toIsoDate(profile.birthDate),
    documentPhotoASubmitted: true,
    documentPhotoBSubmitted: true,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    cityId: profile.cityId,
    serviceZoneIds: profile.zoneIds,
  };
}
