import { isBillingComplete } from '../../../../domain/goalkeepers/billing.js';
import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';

export interface GoalkeeperSectionsView {
  identification: { complete: boolean };
  physicalData: { complete: boolean };
  availability: { complete: boolean };
  /** Municipality and address for the invoices (spec 031, FR-023). */
  billing: { complete: boolean };
}

const EMPTY_SECTIONS: GoalkeeperSectionsView = {
  identification: { complete: false },
  physicalData: { complete: false },
  availability: { complete: false },
  billing: { complete: false },
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
      complete: availability.marketId !== null && availability.zoneIds.length > 0,
    },
    billing: { complete: isBillingComplete(registration.billing) },
  };
}

export function isGoalkeeperRegistrationComplete(registration: GoalkeeperRegistration): boolean {
  const sections = computeGoalkeeperSections(registration);
  return Object.values(sections).every((section) => section.complete);
}

/** Names every section still incomplete — all of them when `registration` is `null`. */
export function missingGoalkeeperSections(registration: GoalkeeperRegistration | null): string[] {
  const sections = computeGoalkeeperSections(registration);
  return (Object.keys(sections) as (keyof GoalkeeperSectionsView)[]).filter((key) => !sections[key].complete);
}
