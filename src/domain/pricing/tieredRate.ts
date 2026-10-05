import {
  MATCH_LEVELS,
  PRICED_MODALITIES,
  type MatchLevel,
  type Modality,
} from '../bookings/matchFormat.js';
import type { PriceTier } from './tier.js';

/** What a match is priced by: its modality and level (the surface never changes the price). */
export interface MatchTier {
  modality: Modality;
  level: MatchLevel;
}

/** Every modality/level a client can choose: 3 modalities × 2 levels, plus `any` (level ignored). */
export const ALL_MATCH_TIERS: readonly MatchTier[] = [
  ...PRICED_MODALITIES.flatMap((modality) => MATCH_LEVELS.map((level) => ({ modality, level }))),
  { modality: 'any', level: 'recreational' },
];

/**
 * The tiers to try, most specific first: modality + level → modality → general. `any` only
 * ever uses the general tier, whatever the level (feature 024, contract §5).
 */
export function candidatesFor(match: MatchTier): PriceTier[] {
  const general: PriceTier = { modality: null, level: null };
  if (match.modality === 'any') return [general];
  return [{ modality: match.modality, level: match.level }, { modality: match.modality, level: null }, general];
}

/**
 * Geography first: `levels` holds the documents of each geographic level, most specific first
 * (zone, city, country). Each level is tried with every candidate tier before moving to the next,
 * so a zone's general price beats its city's Fútbol 11 price. `null` when nothing matches.
 */
export function resolveTiered<T extends PriceTier>(levels: readonly (readonly T[])[], match: MatchTier): T | null {
  const candidates = candidatesFor(match);
  for (const documents of levels) {
    for (const tier of candidates) {
      const found = documents.find((document) => document.modality === tier.modality && document.level === tier.level);
      if (found) return found;
    }
  }
  return null;
}
