import { describe, expect, it } from 'vitest';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';
import { parseTier, tierIssues } from '../../../../src/domain/pricing/tier.js';

describe('tierIssues', () => {
  it.each([
    ['the general tier', null, null],
    ['a modality alone', 'futbol_11', null],
    ['a modality with a level', 'futbol_11', 'competitive'],
  ])('accepts %s', (_label, modality, level) => {
    expect(tierIssues(modality, level)).toEqual([]);
  });

  it('refuses a level without a modality, on the level', () => {
    expect(tierIssues(null, 'competitive')).toEqual([{ path: 'level', code: 'level_requires_modality', message: expect.any(String) }]);
  });

  it.each([
    ['the open modality any', 'any'],
    ['an unknown modality', 'futbol_5'],
  ])('refuses %s, on the modality', (_label, modality) => {
    expect(tierIssues(modality, null)).toEqual([{ path: 'modality', code: 'unknown_modality', message: expect.any(String) }]);
  });

  it('refuses an unknown level, on the level', () => {
    expect(tierIssues('futbol_11', 'pro')).toEqual([{ path: 'level', code: 'unknown_level', message: expect.any(String) }]);
  });

  it('treats undefined as null', () => {
    expect(tierIssues(undefined, undefined)).toEqual([]);
  });
});

describe('parseTier', () => {
  it('throws the first issue, naming the document', () => {
    expect(() => parseTier(null, 'competitive', 'rentalRates document r1')).toThrow(InvalidConfigurationError);
    expect(() => parseTier(null, 'competitive', 'rentalRates document r1')).toThrow(/rentalRates document r1: level requires a modality/);
  });
});
