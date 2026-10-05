import { describe, expect, it } from 'vitest';
import { MatchFormat, isModality, isPricedModality } from '../../../../src/domain/bookings/matchFormat.js';

const valid = { modality: 'futbol_11', level: 'competitive', surfaceId: 'synthetic_grass', surfaceName: 'Grama sintética' };

describe('MatchFormat', () => {
  it('accepts every modality, including any', () => {
    for (const modality of ['micro_futsal', 'futbol_medio', 'futbol_11', 'any']) {
      expect(new MatchFormat({ ...valid, modality }).modality).toBe(modality);
    }
  });

  it.each([
    ['an unknown modality', { modality: 'futbol_5' }],
    ['an unknown level', { level: 'pro' }],
    ['an empty surface id', { surfaceId: '' }],
    ['a blank surface name', { surfaceName: '  ' }],
  ])('rejects %s', (_label, override) => {
    expect(() => new MatchFormat({ ...valid, ...override })).toThrow();
  });

  it('never treats any as a priced modality', () => {
    expect(isModality('any')).toBe(true);
    expect(isPricedModality('any')).toBe(false);
    expect(isPricedModality('futbol_medio')).toBe(true);
  });
});
