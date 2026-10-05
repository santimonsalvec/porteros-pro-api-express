import { describe, expect, it } from 'vitest';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';
import { RentalRate } from '../../../../src/domain/pricing/rentalRate.js';

const valid = { id: 'r1', scope: 'zone', refId: 'zone-1', durationMinutes: 60, amount: 40000 };

describe('RentalRate', () => {
  it('ignores a leftover currency field on a stored document — the currency is the country\'s', () => {
    const rate = new RentalRate({ ...valid, currency: 'COP' } as never);
    expect(rate).not.toHaveProperty('currency');
  });

  it('builds a valid rate', () => {
    const rate = new RentalRate(valid);
    expect(rate).toMatchObject({ scope: 'zone', refId: 'zone-1', durationMinutes: 60, amount: 40000 });
  });

  it.each([
    ['an unknown scope', { scope: 'region' }],
    ['an empty refId', { refId: '' }],
    ['a duration outside 60/90/120', { durationMinutes: 45 }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['a fractional amount', { amount: 40000.5 }],
  ])('rejects %s', (_label, override) => {
    expect(() => new RentalRate({ ...valid, ...override })).toThrow(InvalidConfigurationError);
  });

  it('is the general rate when no modality or level is stored', () => {
    expect(new RentalRate(valid)).toMatchObject({ modality: null, level: null });
  });

  it('keeps a modality, with or without a level', () => {
    expect(new RentalRate({ ...valid, modality: 'futbol_11' })).toMatchObject({ modality: 'futbol_11', level: null });
    expect(new RentalRate({ ...valid, modality: 'futbol_11', level: 'competitive' })).toMatchObject({
      modality: 'futbol_11',
      level: 'competitive',
    });
  });

  it.each([
    ['a level without a modality', { level: 'competitive' }],
    ['the open modality any', { modality: 'any' }],
    ['an unknown modality', { modality: 'futbol_5' }],
    ['an unknown level', { modality: 'futbol_11', level: 'pro' }],
  ])('rejects %s', (_label, override) => {
    expect(() => new RentalRate({ ...valid, ...override })).toThrow(InvalidConfigurationError);
  });
});
