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
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  neighborhood: string | null;
  radiusKm: number | null;
}

function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Projects a `GoalkeeperRegistration` into the shape every `/api/goalkeepers/me` route
 * returns. `formattedAddress` and the raw document-photo ids are deliberately never
 * included (FR-018, FR-021) — only the booleans derived from the photo ids.
 * `null` synthesizes the `not_started` shape with no database write (research.md §10).
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
      latitude: null,
      longitude: null,
      city: null,
      state: null,
      country: null,
      neighborhood: null,
      radiusKm: null,
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
    latitude: registration.location.latitude,
    longitude: registration.location.longitude,
    city: registration.location.city,
    state: registration.location.state,
    country: registration.location.country,
    neighborhood: registration.location.neighborhood,
    radiusKm: registration.availability.radiusKm,
  };
}
