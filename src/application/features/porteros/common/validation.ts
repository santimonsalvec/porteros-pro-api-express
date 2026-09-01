export const MIN_HEIGHT_CM = 120;
export const MAX_HEIGHT_CM = 230;
export const MIN_WEIGHT_KG = 40;
export const MAX_WEIGHT_KG = 150;
export const MIN_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 50;
export const MIN_PORTERO_AGE_YEARS = 18;

function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export interface IdentificationFieldsInput {
  documentNumber?: string;
  issueDate?: string;
  birthDate?: string;
}

export interface IdentificationFieldsValidation {
  fieldErrors: Record<string, string>;
  /** Only set when the corresponding raw input was provided AND passed its own per-field checks. */
  parsedIssueDate?: Date;
  parsedBirthDate?: Date;
}

/**
 * Per-field checks only — `issueDate` not before `birthDate` is a cross-field rule
 * that depends on whichever birthDate ends up in effect (this request's or a
 * previously stored one), so it's applied by the handler after merging, not here.
 */
export function validateIdentificationFields(
  input: IdentificationFieldsInput,
  now: Date = new Date(),
): IdentificationFieldsValidation {
  const fieldErrors: Record<string, string> = {};
  let parsedIssueDate: Date | undefined;
  let parsedBirthDate: Date | undefined;

  if (input.documentNumber !== undefined && input.documentNumber.trim() === '') {
    fieldErrors.documentNumber = 'Document number is required.';
  }

  if (input.birthDate !== undefined) {
    const date = new Date(input.birthDate);
    if (Number.isNaN(date.getTime())) {
      fieldErrors.birthDate = 'Birth date is not a valid date.';
    } else if (date.getTime() > now.getTime()) {
      fieldErrors.birthDate = 'Birth date cannot be in the future.';
    } else if (calculateAge(date, now) < MIN_PORTERO_AGE_YEARS) {
      fieldErrors.birthDate = `You must be at least ${MIN_PORTERO_AGE_YEARS} years old to register as a portero.`;
    } else {
      parsedBirthDate = date;
    }
  }

  if (input.issueDate !== undefined) {
    const date = new Date(input.issueDate);
    if (Number.isNaN(date.getTime())) {
      fieldErrors.issueDate = 'Issue date is not a valid date.';
    } else if (date.getTime() > now.getTime()) {
      fieldErrors.issueDate = 'Issue date cannot be in the future.';
    } else {
      parsedIssueDate = date;
    }
  }

  return { fieldErrors, parsedIssueDate, parsedBirthDate };
}

export function validatePhysicalData(input: { heightCm?: number; weightKg?: number }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.heightCm !== undefined && (input.heightCm < MIN_HEIGHT_CM || input.heightCm > MAX_HEIGHT_CM)) {
    errors.heightCm = `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`;
  }
  if (input.weightKg !== undefined && (input.weightKg < MIN_WEIGHT_KG || input.weightKg > MAX_WEIGHT_KG)) {
    errors.weightKg = `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`;
  }
  return errors;
}

export function validateLocation(input: {
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
    errors.latitude = 'Latitude must be between -90 and 90.';
  }
  if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
    errors.longitude = 'Longitude must be between -180 and 180.';
  }
  if (input.city !== undefined && input.city.trim() === '') errors.city = 'City is required.';
  if (input.state !== undefined && input.state.trim() === '') errors.state = 'State is required.';
  if (input.country !== undefined && input.country.trim() === '') errors.country = 'Country is required.';
  return errors;
}

export function validateAvailability(input: { radiusKm?: number }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.radiusKm !== undefined) {
    if (!Number.isInteger(input.radiusKm) || input.radiusKm < MIN_RADIUS_KM || input.radiusKm > MAX_RADIUS_KM) {
      errors.radiusKm = `Coverage radius must be a whole number between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km.`;
    }
  }
  return errors;
}
