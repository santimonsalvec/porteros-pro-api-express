import { isMatchLevel, isPricedModality, type MatchLevel, type PricedModality } from '../bookings/matchFormat.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';

/** Which matches a rate or commission applies to: `null` fields mean "every" (feature 024). */
export interface PriceTier {
  modality: PricedModality | null;
  level: MatchLevel | null;
}

/**
 * Reads a stored document's optional `modality`/`level`. A level without a modality is refused:
 * the resolution chain is modality + level → modality → general, with no level-only step.
 */
export function parseTier(modality: unknown, level: unknown, where: string): PriceTier {
  const parsedModality = modality ?? null;
  const parsedLevel = level ?? null;
  if (parsedModality !== null && !isPricedModality(parsedModality)) {
    throw new InvalidConfigurationError(`${where}: unknown modality '${String(parsedModality)}'`);
  }
  if (parsedLevel !== null && !isMatchLevel(parsedLevel)) {
    throw new InvalidConfigurationError(`${where}: unknown level '${String(parsedLevel)}'`);
  }
  if (parsedLevel !== null && parsedModality === null) {
    throw new InvalidConfigurationError(`${where}: level requires a modality`);
  }
  return { modality: parsedModality, level: parsedLevel };
}
