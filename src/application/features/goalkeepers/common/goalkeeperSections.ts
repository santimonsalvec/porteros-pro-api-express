import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';

export interface GoalkeeperSectionsView {
  identification: { complete: boolean };
  physicalData: { complete: boolean };
  availability: { complete: boolean };
}

const EMPTY_SECTIONS: GoalkeeperSectionsView = {
  identification: { complete: false },
  physicalData: { complete: false },
  availability: { complete: false },
};

/**
 * Derives section completeness from raw stored field values — never itself
 * persisted, so there is no second source of truth to drift (research.md §9).
 * `null` (no registration exists yet) synthesizes every section as incomplete.
 */
export function computeGoalkeeperSections(registration: GoalkeeperRegistration | null): GoalkeeperSectionsView {
  if (!registration) return { ...EMPTY_SECTIONS };

  const { identification, physicalData, availability } = registration;
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
    availability: {
      complete: availability.cityId !== null && availability.zoneIds.length > 0,
    },
  };
}

export function isGoalkeeperRegistrationComplete(registration: GoalkeeperRegistration): boolean {
  const sections = computeGoalkeeperSections(registration);
  return sections.identification.complete && sections.physicalData.complete && sections.availability.complete;
}

/** Names every section still incomplete — all three when `registration` is `null`. */
export function missingGoalkeeperSections(registration: GoalkeeperRegistration | null): string[] {
  const sections = computeGoalkeeperSections(registration);
  return (Object.keys(sections) as (keyof GoalkeeperSectionsView)[]).filter((key) => !sections[key].complete);
}
