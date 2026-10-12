import { isMatchLevel, isPricedModality, type MatchLevel, type PricedModality } from '../bookings/matchFormat.js';
import { issue, type ConfigIssue } from './configIssue.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';

/** Which matches a rate or commission applies to: `null` fields mean "every" (feature 024). */
export interface PriceTier {
  modality: PricedModality | null;
  level: MatchLevel | null;
}

/**
 * Every rule an optional `modality`/`level` pair breaks. A level without a modality is refused:
 * the resolution chain is modality + level → modality → general, with no level-only step.
 */
export function tierIssues(modality: unknown, level: unknown): ConfigIssue[] {
  const parsedModality = modality ?? null;
  const parsedLevel = level ?? null;
  const issues: ConfigIssue[] = [];
  if (parsedModality !== null && !isPricedModality(parsedModality)) {
    issues.push(issue('modality', 'unknown_modality', `unknown modality '${String(parsedModality)}'`));
  }
  if (parsedLevel !== null && !isMatchLevel(parsedLevel)) {
    issues.push(issue('level', 'unknown_level', `unknown level '${String(parsedLevel)}'`));
  } else if (parsedLevel !== null && parsedModality === null) {
    issues.push(issue('level', 'level_requires_modality', 'level requires a modality'));
  }
  return issues;
}

/** Reads a stored document's optional `modality`/`level`, throwing its first issue. */
export function parseTier(modality: unknown, level: unknown, where: string): PriceTier {
  const [first] = tierIssues(modality, level);
  if (first) throw new InvalidConfigurationError(`${where}: ${first.message}`);
  return { modality: (modality ?? null) as PricedModality | null, level: (level ?? null) as MatchLevel | null };
}
