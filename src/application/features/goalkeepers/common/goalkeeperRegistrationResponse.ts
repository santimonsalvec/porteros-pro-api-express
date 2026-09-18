import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import { computeGoalkeeperSections, type GoalkeeperSectionsView } from './goalkeeperSections.js';

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
