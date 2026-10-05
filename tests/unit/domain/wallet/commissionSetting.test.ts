import { describe, expect, it } from 'vitest';
import { CommissionSetting } from '../../../../src/domain/wallet/commissionSetting.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';

const base = { id: 'c-1', scope: 'country', refId: 'country-co', amount: 7000 };

describe('CommissionSetting', () => {
  it.each(['country', 'city', 'zone'])('accepts a %s-level commission', (scope) => {
    expect(new CommissionSetting({ ...base, scope })).toMatchObject({ scope, amount: 7000 });
  });

  it.each([
    ['an unknown scope', { scope: 'region' }],
    ['an empty refId', { refId: '' }],
    ['a zero amount', { amount: 0 }],
    ['a fractional amount', { amount: 7000.5 }],
  ])('rejects %s', (_label, change) => {
    expect(() => new CommissionSetting({ ...base, ...change })).toThrow(InvalidConfigurationError);
  });

  it('keeps an optional modality and level (feature 024)', () => {
    expect(new CommissionSetting(base)).toMatchObject({ modality: null, level: null });
    expect(new CommissionSetting({ ...base, modality: 'futbol_11', level: 'competitive' })).toMatchObject({
      modality: 'futbol_11',
      level: 'competitive',
    });
  });

  it('rejects a level without a modality', () => {
    expect(() => new CommissionSetting({ ...base, level: 'competitive' })).toThrow(InvalidConfigurationError);
  });
});
