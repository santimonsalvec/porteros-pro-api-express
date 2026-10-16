import { isPricedModality, type PricedModality } from '../bookings/matchFormat.js';
import { issue, type ConfigIssue } from './configIssue.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';

/** Which matches a rate or commission applies to: `null` means "every modality" (feature 024). */
export interface PriceTier {
  modality: PricedModality | null;
}

/** Every rule an optional `modality` breaks. The resolution chain is modality → general. */
export function tierIssues(modality: unknown): ConfigIssue[] {
  const parsedModality = modality ?? null;
  const issues: ConfigIssue[] = [];
  if (parsedModality !== null && !isPricedModality(parsedModality)) {
    issues.push(issue('modality', 'unknown_modality', `unknown modality '${String(parsedModality)}'`));
  }
  return issues;
}

/** Reads a stored document's optional `modality`, throwing its first issue. */
export function parseTier(modality: unknown, where: string): PriceTier {
  const [first] = tierIssues(modality);
  if (first) throw new InvalidConfigurationError(`${where}: ${first.message}`);
  return { modality: (modality ?? null) as PricedModality | null };
}
