import type { PorteroRegistration } from '../../../../domain/porteros/porteroRegistration.js';

export interface PorteroSectionsView {
  identification: { complete: boolean };
  physicalData: { complete: boolean };
  location: { complete: boolean };
  availability: { complete: boolean };
}

const EMPTY_SECTIONS: PorteroSectionsView = {
  identification: { complete: false },
  physicalData: { complete: false },
  location: { complete: false },
  availability: { complete: false },
};

/**
 * Derives section completeness from raw stored field values — never itself
 * persisted, so there is no second source of truth to drift (research.md §9).
 * `null` (no registration exists yet) synthesizes every section as incomplete.
 */
export function computePorteroSections(registration: PorteroRegistration | null): PorteroSectionsView {
  if (!registration) return { ...EMPTY_SECTIONS };

  const { identification, physicalData, location, availability } = registration;
  return {
    identification: {
      complete:
        identification.documentType !== null &&
        identification.documentNumber !== null &&
        identification.issueDate !== null &&
        identification.birthDate !== null &&
        identification.documentPhotoAId !== null &&
        identification.documentPhotoBId !== null,
    },
    physicalData: {
      complete: physicalData.heightCm !== null && physicalData.weightKg !== null,
    },
    location: {
      complete:
        location.latitude !== null &&
        location.longitude !== null &&
        location.city !== null &&
        location.state !== null &&
        location.country !== null,
    },
    availability: {
      complete: availability.radiusKm !== null,
    },
  };
}

export function isPorteroRegistrationComplete(registration: PorteroRegistration): boolean {
  const sections = computePorteroSections(registration);
  return sections.identification.complete && sections.physicalData.complete && sections.location.complete && sections.availability.complete;
}

/** Names every section still incomplete — all four when `registration` is `null`. */
export function missingPorteroSections(registration: PorteroRegistration | null): string[] {
  const sections = computePorteroSections(registration);
  return (Object.keys(sections) as (keyof PorteroSectionsView)[]).filter((key) => !sections[key].complete);
}
