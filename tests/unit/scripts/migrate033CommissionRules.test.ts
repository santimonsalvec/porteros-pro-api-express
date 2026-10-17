import { describe, expect, it } from 'vitest';
import { planRuleRewrite, verifyRules } from '../../../scripts/lib/migrate033.js';

describe('migration 033: commission rules (amount → fixedAmount + percentBps)', () => {
  it('rewrites a legacy document into a fixed rule and drops amount', () => {
    expect(planRuleRewrite({ _id: 'c1', scope: 'zone', refId: 'z', modality: null, amount: 7000, revision: 2 })).toEqual({
      _id: 'c1',
      scope: 'zone',
      refId: 'z',
      modality: null,
      fixedAmount: 7000,
      percentBps: 0,
      revision: 2,
    });
  });

  it('leaves an already migrated document untouched (idempotent)', () => {
    const migrated = { _id: 'c1', scope: 'zone', refId: 'z', modality: null, fixedAmount: 7000, percentBps: 0, revision: 2 };
    expect(planRuleRewrite(migrated)).toEqual(migrated);
    const goalkeeper = { ...migrated, scope: 'goalkeeper', countryId: 'co', validUntil: null };
    expect(planRuleRewrite(goalkeeper)).toEqual(goalkeeper);
  });

  it('keeps an explicit new value over a stray legacy amount', () => {
    expect(planRuleRewrite({ _id: 'c1', scope: 'zone', refId: 'z', amount: 7000, fixedAmount: 3000, percentBps: 1000 })).toEqual({
      _id: 'c1',
      scope: 'zone',
      refId: 'z',
      fixedAmount: 3000,
      percentBps: 1000,
    });
  });

  it('verifies that every document has both components and none keeps amount', () => {
    expect(verifyRules([{ _id: 'a', fixedAmount: 7000, percentBps: 0 }, { _id: 'b', fixedAmount: 0, percentBps: 500 }])).toEqual([]);
    expect(verifyRules([{ _id: 'a', fixedAmount: 7000, percentBps: 0, amount: 7000 }])).toEqual(['a: still carries amount']);
    expect(verifyRules([{ _id: 'b', fixedAmount: 7000 }])).toEqual(['b: percentBps missing']);
    expect(verifyRules([{ _id: 'c', percentBps: 0 }])).toEqual(['c: fixedAmount missing', 'c: both components are zero']);
  });
});
