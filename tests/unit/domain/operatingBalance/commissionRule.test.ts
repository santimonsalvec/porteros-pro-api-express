import { describe, expect, it } from 'vitest';
import { CommissionBreakdown, commissionFor, kindOf } from '../../../../src/domain/operatingBalance/commissionRule.js';
import { CommissionSetting } from '../../../../src/domain/operatingBalance/commissionSetting.js';

const rule = (fixedAmount: number, percentBps: number, modality: string | null = null) =>
  new CommissionSetting({ id: `rule-${fixedAmount}-${percentBps}`, scope: 'zone', refId: 'zone-1', fixedAmount, percentBps, modality });

describe('commissionFor', () => {
  it('a fixed rule charges the fixed amount whatever the base', () => {
    const breakdown = commissionFor(rule(7000, 0), 120000);
    expect(breakdown).toMatchObject({ base: 120000, percentBps: 0, percentAmount: 0, fixedAmount: 7000, net: 7000 });
  });

  it('a percent rule charges the percentage of the base, rounded half up', () => {
    expect(commissionFor(rule(0, 1000), 120000)).toMatchObject({ percentAmount: 12000, fixedAmount: 0, net: 12000 });
    expect(commissionFor(rule(0, 1250), 120000)).toMatchObject({ percentAmount: 15000, net: 15000 });
    expect(commissionFor(rule(0, 1900), 50)).toMatchObject({ percentAmount: 10, net: 10 });
  });

  it('a mixed rule sums the percentage and the fixed amount (clarification 4)', () => {
    expect(commissionFor(rule(3000, 1000), 120000)).toMatchObject({ percentAmount: 12000, fixedAmount: 3000, net: 15000 });
  });

  it('is null when the percentage rounds to nothing and there is no fixed amount', () => {
    expect(commissionFor(rule(0, 100), 3)).toBeNull();
  });

  it('carries the rule identity: id, origin, modality', () => {
    const breakdown = commissionFor(rule(3000, 1000, 'futbol_11'), 120000);
    expect(breakdown).toMatchObject({ ruleId: 'rule-3000-1000', origin: { scope: 'zone', refId: 'zone-1' }, modality: 'futbol_11' });
  });

  it('refuses a base that is not a positive integer', () => {
    expect(() => commissionFor(rule(7000, 0), 0)).toThrow(/base/);
    expect(() => commissionFor(rule(7000, 0), 100.5)).toThrow(/base/);
  });
});

describe('CommissionBreakdown', () => {
  const valid = {
    base: 120000,
    percentBps: 1000,
    percentAmount: 12000,
    fixedAmount: 3000,
    net: 15000,
    ruleId: 'rule-1',
    origin: { scope: 'zone' as const, refId: 'zone-1' },
    modality: null,
  };

  it('accepts a consistent breakdown', () => {
    expect(new CommissionBreakdown(valid)).toMatchObject(valid);
  });

  it.each([
    ['net not the sum', { net: 15001 }],
    ['percent amount not the rounded percentage', { percentAmount: 12001, net: 15001 }],
    ['zero net', { percentBps: 0, percentAmount: 0, fixedAmount: 0, net: 0 }],
    ['zero base', { base: 0, percentAmount: 0, net: 3000 }],
    ['fractional fixed amount', { fixedAmount: 3000.5, net: 15000.5 }],
    ['unknown scope', { origin: { scope: 'region', refId: 'r' } }],
    ['empty rule id', { ruleId: '' }],
  ])('rejects %s', (_label, change) => {
    expect(() => new CommissionBreakdown({ ...valid, ...change } as never)).toThrow(/CommissionBreakdown/);
  });

  it('accepts a goalkeeper origin', () => {
    expect(new CommissionBreakdown({ ...valid, origin: { scope: 'goalkeeper', refId: 'user-1' } }).origin.scope).toBe('goalkeeper');
  });
});

describe('kindOf', () => {
  it('derives the kind from the components', () => {
    expect(kindOf(rule(7000, 0))).toBe('fixed');
    expect(kindOf(rule(0, 1000))).toBe('percent');
    expect(kindOf(rule(3000, 1000))).toBe('mixed');
  });
});
