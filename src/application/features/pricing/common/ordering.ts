import { MATCH_LEVELS, PRICED_MODALITIES } from '../../../../domain/bookings/matchFormat.js';

const rank = (list: readonly string[], value: string | null) => (value === null ? -1 : list.indexOf(value));

/** General first, then each modality in its fixed order, its general tier before its levels. */
export function compareTiers(a: { modality: string | null; level: string | null }, b: { modality: string | null; level: string | null }): number {
  return rank(PRICED_MODALITIES, a.modality) - rank(PRICED_MODALITIES, b.modality) || rank(MATCH_LEVELS, a.level) - rank(MATCH_LEVELS, b.level);
}

/** Text in Spanish order, empty values last. */
export function compareNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'es');
}
