import { describe, expect, it } from 'vitest';
import {
  ALL_MATCH_TIERS,
  candidatesFor,
  resolveTiered,
  type MatchTier,
} from '../../../../src/domain/pricing/tieredRate.js';
import type { PriceTier } from '../../../../src/domain/pricing/tier.js';

type Doc = PriceTier & { amount: number };

const doc = (amount: number, modality: Doc['modality'] = null, level: Doc['level'] = null): Doc => ({ amount, modality, level });

const F11_COMPETITIVE: MatchTier = { modality: 'futbol_11', level: 'competitive' };
const F11_RECREATIONAL: MatchTier = { modality: 'futbol_11', level: 'recreational' };
const MICRO_COMPETITIVE: MatchTier = { modality: 'micro_futsal', level: 'competitive' };
const ANY_COMPETITIVE: MatchTier = { modality: 'any', level: 'competitive' };

describe('candidatesFor', () => {
  it('tries modality + level, then modality, then general', () => {
    expect(candidatesFor(F11_COMPETITIVE)).toEqual([
      { modality: 'futbol_11', level: 'competitive' },
      { modality: 'futbol_11', level: null },
      { modality: null, level: null },
    ]);
  });

  it('only tries the general tier for any, whatever the level', () => {
    expect(candidatesFor(ANY_COMPETITIVE)).toEqual([{ modality: null, level: null }]);
  });
});

describe('resolveTiered', () => {
  const city = [doc(50_000), doc(70_000, 'futbol_11'), doc(80_000, 'futbol_11', 'competitive'), doc(40_000, 'micro_futsal')];

  it.each<[string, MatchTier, number]>([
    ['the exact modality + level', F11_COMPETITIVE, 80_000],
    ['the modality when the level has no own price', F11_RECREATIONAL, 70_000],
    ['the modality for another level', MICRO_COMPETITIVE, 40_000],
    ['the general price for a modality without any price', { modality: 'futbol_medio', level: 'recreational' }, 50_000],
    ['the general price for any, even when competitive', ANY_COMPETITIVE, 50_000],
  ])('picks %s', (_label, match, amount) => {
    expect(resolveTiered([[], city], match)?.amount).toBe(amount);
  });

  it('lets a zone general price beat its city Fútbol 11 price (geography first)', () => {
    expect(resolveTiered([[doc(55_000)], city], F11_COMPETITIVE)?.amount).toBe(55_000);
  });

  it('falls through a zone that only prices another modality', () => {
    expect(resolveTiered([[doc(99_000, 'micro_futsal')], city], F11_COMPETITIVE)?.amount).toBe(80_000);
  });

  it('reaches the country when neither the zone nor the city match', () => {
    expect(resolveTiered([[], [doc(1, 'micro_futsal')], [doc(7_000)]], F11_COMPETITIVE)?.amount).toBe(7_000);
  });

  it('is null when nothing matches anywhere', () => {
    expect(resolveTiered([[doc(1, 'micro_futsal')], []], F11_COMPETITIVE)).toBeNull();
    expect(resolveTiered([[doc(1, 'futbol_11')]], ANY_COMPETITIVE)).toBeNull();
  });
});

describe('ALL_MATCH_TIERS', () => {
  it('covers the 6 priced combinations plus any', () => {
    expect(ALL_MATCH_TIERS).toHaveLength(7);
    expect(ALL_MATCH_TIERS.filter((tier) => tier.modality === 'any')).toHaveLength(1);
  });
});
