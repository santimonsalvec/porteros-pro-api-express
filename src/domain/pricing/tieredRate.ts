import { PRICED_MODALITIES, type Modality } from '../bookings/matchFormat.js';
import type { PriceTier } from './tier.js';

/** What a match is priced by: its modality (the surface never changes the price). */
export interface MatchTier {
  modality: Modality;
}

/** Every modality a client can choose: the 3 priced ones, plus `any`. */
export const ALL_MATCH_TIERS: readonly MatchTier[] = [
  ...PRICED_MODALITIES.map((modality) => ({ modality })),
  { modality: 'any' },
];

/**
 * The tiers to try, most specific first: modality → general. `any` only ever uses the general
 * tier (feature 024, contract §5).
 */
export function candidatesFor(match: MatchTier): PriceTier[] {
  const general: PriceTier = { modality: null };
  if (match.modality === 'any') return [general];
  return [{ modality: match.modality }, general];
}

/**
 * Geography first: `levels` holds the documents of each geographic level, most specific first
 * (zone, market, country). Each level is tried with every candidate tier before moving to the next,
 * so a zone's general price beats its market's Fútbol 11 price. `null` when nothing matches.
 */
export function resolveTiered<T extends PriceTier>(levels: readonly (readonly T[])[], match: MatchTier): T | null {
  const candidates = candidatesFor(match);
  for (const documents of levels) {
    for (const tier of candidates) {
      const found = documents.find((document) => document.modality === tier.modality);
      if (found) return found;
    }
  }
  return null;
}
