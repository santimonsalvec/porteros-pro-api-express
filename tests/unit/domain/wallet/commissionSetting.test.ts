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

describe('CommissionSetting revision', () => {
  it('is 0 when the document has none, and keeps a stored one', () => {
    expect(new CommissionSetting(base).revision).toBe(0);
    expect(new CommissionSetting({ ...base, revision: 7 }).revision).toBe(7);
  });

  it.each([-1, 1.5])('rejects a broken revision (%s)', (revision) => {
    expect(() => new CommissionSetting({ ...base, revision })).toThrow(/commissionSettings document c-1: revision/);
  });
});
