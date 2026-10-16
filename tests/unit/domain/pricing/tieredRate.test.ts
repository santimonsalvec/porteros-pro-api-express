import { describe, expect, it } from 'vitest';
import {
  ALL_MATCH_TIERS,
  candidatesFor,
  resolveTiered,
  type MatchTier,
} from '../../../../src/domain/pricing/tieredRate.js';
import type { PriceTier } from '../../../../src/domain/pricing/tier.js';

type Doc = PriceTier & { amount: number };

const doc = (amount: number, modality: Doc['modality'] = null): Doc => ({ amount, modality });

const F11: MatchTier = { modality: 'futbol_11' };
const MICRO: MatchTier = { modality: 'micro_futsal' };
const ANY: MatchTier = { modality: 'any' };

describe('candidatesFor', () => {
  it('tries the modality, then general', () => {
    expect(candidatesFor(F11)).toEqual([{ modality: 'futbol_11' }, { modality: null }]);
  });

  it('only tries the general tier for any', () => {
    expect(candidatesFor(ANY)).toEqual([{ modality: null }]);
  });
});

describe('resolveTiered', () => {
  const city = [doc(50_000), doc(70_000, 'futbol_11'), doc(40_000, 'micro_futsal')];

  it.each<[string, MatchTier, number]>([
    ['the exact modality', F11, 70_000],
    ['another modality', MICRO, 40_000],
    ['the general price for a modality without any price', { modality: 'futbol_medio' }, 50_000],
    ['the general price for any', ANY, 50_000],
  ])('picks %s', (_label, match, amount) => {
    expect(resolveTiered([[], city], match)?.amount).toBe(amount);
  });

  it('lets a zone general price beat its city Fútbol 11 price (geography first)', () => {
    expect(resolveTiered([[doc(55_000)], city], F11)?.amount).toBe(55_000);
  });

  it('falls through a zone that only prices another modality', () => {
    expect(resolveTiered([[doc(99_000, 'micro_futsal')], city], F11)?.amount).toBe(70_000);
  });

  it('reaches the country when neither the zone nor the city match', () => {
    expect(resolveTiered([[], [doc(1, 'micro_futsal')], [doc(7_000)]], F11)?.amount).toBe(7_000);
  });

  it('is null when nothing matches anywhere', () => {
    expect(resolveTiered([[doc(1, 'micro_futsal')], []], F11)).toBeNull();
    expect(resolveTiered([[doc(1, 'futbol_11')]], ANY)).toBeNull();
  });
});

describe('ALL_MATCH_TIERS', () => {
  it('covers the 3 priced modalities plus any', () => {
    expect(ALL_MATCH_TIERS).toHaveLength(4);
    expect(ALL_MATCH_TIERS.filter((tier) => tier.modality === 'any')).toHaveLength(1);
  });
});
