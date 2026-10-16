import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import type { FieldStatus, RegistrationStep, SectionName } from './adminViews.js';
import { computeGoalkeeperSections } from './goalkeeperSections.js';

/** The sections in the order the app asks for them. */
const SECTIONS: readonly SectionName[] = ['identification', 'physicalData', 'availability', 'billing'];

/** The first section still incomplete, or `ready` (admin spec 005, research §12). */
export function registrationStep(registration: GoalkeeperRegistration): RegistrationStep {
  const sections = computeGoalkeeperSections(registration);
  return SECTIONS.find((section) => !sections[section].complete) ?? 'ready';
}

export function completeSections(registration: GoalkeeperRegistration): SectionName[] {
  const sections = computeGoalkeeperSections(registration);
  return SECTIONS.filter((section) => sections[section].complete);
}

/** Whether each field is filled in, never its value: the document stays out of the admin (FR-016). */
export function fieldStatus(registration: GoalkeeperRegistration): {
  identification: Record<string, FieldStatus>;
  physicalData: Record<string, FieldStatus>;
} {
  const status = (value: unknown): FieldStatus => (value === null || value === undefined ? 'missing' : 'complete');
  const { identification, physicalData } = registration;
  return {
    identification: {
      documentType: status(identification.documentType),
      documentNumber: status(identification.documentNumber),
      issueDate: status(identification.issueDate),
      birthDate: status(identification.birthDate),
      documentPhotoA: status(identification.documentPhotoAId),
      documentPhotoB: status(identification.documentPhotoBId),
    },
    physicalData: { heightCm: status(physicalData.heightCm), weightKg: status(physicalData.weightKg) },
  };
}
