import { describe, expect, it } from 'vitest';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';
import { parseTier, tierIssues } from '../../../../src/domain/pricing/tier.js';

describe('tierIssues', () => {
  it.each([
    ['the general tier', null],
    ['a modality', 'futbol_11'],
  ])('accepts %s', (_label, modality) => {
    expect(tierIssues(modality)).toEqual([]);
  });

  it.each([
    ['the open modality any', 'any'],
    ['an unknown modality', 'futbol_5'],
  ])('refuses %s, on the modality', (_label, modality) => {
    expect(tierIssues(modality)).toEqual([{ path: 'modality', code: 'unknown_modality', message: expect.any(String) }]);
  });

  it('treats undefined as null', () => {
    expect(tierIssues(undefined)).toEqual([]);
  });
});

describe('parseTier', () => {
  it('reads the modality, null when absent', () => {
    expect(parseTier('futbol_11', 'rentalRates document r1')).toEqual({ modality: 'futbol_11' });
    expect(parseTier(undefined, 'rentalRates document r1')).toEqual({ modality: null });
  });

  it('throws the first issue, naming the document', () => {
    expect(() => parseTier('any', 'rentalRates document r1')).toThrow(InvalidConfigurationError);
    expect(() => parseTier('any', 'rentalRates document r1')).toThrow(/rentalRates document r1: unknown modality 'any'/);
  });
});
