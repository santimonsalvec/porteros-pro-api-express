import { describe, expect, it } from 'vitest';
import { CommissionSetting } from '../../../../src/domain/operatingBalance/commissionSetting.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';

const base = { id: 'c-1', scope: 'country', refId: 'country-co', fixedAmount: 7000, percentBps: 0 };
const now = new Date('2026-10-17T12:00:00Z');

describe('CommissionSetting', () => {
  it.each(['country', 'market', 'zone'])('accepts a %s-level commission', (scope) => {
    expect(new CommissionSetting({ ...base, scope })).toMatchObject({ scope, fixedAmount: 7000, percentBps: 0 });
  });

  it('accepts a percent-only and a mixed rule', () => {
    expect(new CommissionSetting({ ...base, fixedAmount: 0, percentBps: 1000 })).toMatchObject({ fixedAmount: 0, percentBps: 1000, kind: 'percent' });
    expect(new CommissionSetting({ ...base, fixedAmount: 3000, percentBps: 1000 })).toMatchObject({ kind: 'mixed' });
    expect(new CommissionSetting(base).kind).toBe('fixed');
  });

  it('reads a legacy document whose only value is amount as a fixed rule', () => {
    expect(new CommissionSetting({ id: 'c-old', scope: 'zone', refId: 'z', amount: 5000 })).toMatchObject({ fixedAmount: 5000, percentBps: 0, kind: 'fixed' });
  });

  it.each([
    ['an unknown scope', { scope: 'region' }],
    ['an empty refId', { refId: '' }],
    ['both components at zero', { fixedAmount: 0, percentBps: 0 }],
    ['a fractional fixed amount', { fixedAmount: 7000.5 }],
    ['a negative fixed amount', { fixedAmount: -1 }],
    ['a fractional percentage', { percentBps: 10.5 }],
    ['a percentage above 100 %', { percentBps: 10001 }],
    ['a negative percentage', { percentBps: -1 }],
    ['a countryId on a geography scope', { countryId: 'country-co' }],
    ['a validUntil on a geography scope', { validUntil: now }],
  ])('rejects %s', (_label, change) => {
    expect(() => new CommissionSetting({ ...base, ...change })).toThrow(InvalidConfigurationError);
  });

  it('keeps an optional modality (feature 024)', () => {
    expect(new CommissionSetting(base)).toMatchObject({ modality: null });
    expect(new CommissionSetting({ ...base, modality: 'futbol_11' })).toMatchObject({ modality: 'futbol_11' });
  });

  it('rejects the open modality any', () => {
    expect(() => new CommissionSetting({ ...base, modality: 'any' })).toThrow(InvalidConfigurationError);
  });

  it('geography rules are active anywhere, any time', () => {
    expect(new CommissionSetting(base).isActiveAt(now, 'country-xx')).toBe(true);
  });
});

describe('CommissionSetting for a goalkeeper (spec 033)', () => {
  const goalkeeper = { id: 'c-g', scope: 'goalkeeper', refId: 'user-1', fixedAmount: 0, percentBps: 500, countryId: 'country-co' };

  it('requires the country it was created in', () => {
    expect(() => new CommissionSetting({ ...goalkeeper, countryId: undefined })).toThrow(/countryId/);
    expect(new CommissionSetting(goalkeeper)).toMatchObject({ scope: 'goalkeeper', countryId: 'country-co', validUntil: null });
  });

  it('is active in its country while not expired; never expires when validUntil is null', () => {
    const rule = new CommissionSetting({ ...goalkeeper, validUntil: new Date('2026-10-31T23:59:00Z') });
    expect(rule.isActiveAt(now, 'country-co')).toBe(true);
    expect(rule.isActiveAt(new Date('2026-10-31T23:59:00Z'), 'country-co')).toBe(false);
    expect(rule.isActiveAt(new Date('2026-11-01T00:00:00Z'), 'country-co')).toBe(false);
    expect(new CommissionSetting(goalkeeper).isActiveAt(new Date('2030-01-01T00:00:00Z'), 'country-co')).toBe(true);
  });

  it('is not active in another country (FR-010)', () => {
    expect(new CommissionSetting(goalkeeper).isActiveAt(now, 'country-mx')).toBe(false);
  });

  it('rejects an invalid validUntil', () => {
    expect(() => new CommissionSetting({ ...goalkeeper, validUntil: new Date('nope') })).toThrow(/validUntil/);
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
