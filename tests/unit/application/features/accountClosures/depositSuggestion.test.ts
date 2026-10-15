import { describe, expect, it } from 'vitest';
import { suggestDepositAmount } from '../../../../../src/application/features/accountClosures/common/depositSuggestion.js';

const options = [
  { amount: 20000, cost: 1464, net: 18536 },
  { amount: 50000, cost: 2000, net: 48000 },
  { amount: 100000, cost: 3000, net: 97000 },
];

describe('suggestDepositAmount (feature 029)', () => {
  it('is the smallest option whose net covers the debt', () => {
    expect(suggestDepositAmount(options, 10000)).toBe(20000);
    expect(suggestDepositAmount(options, 18536)).toBe(20000);
    expect(suggestDepositAmount(options, 18537)).toBe(50000);
    expect(suggestDepositAmount(options, 90000)).toBe(100000);
  });

  it('is the largest option when none covers it alone, so it can be repeated', () => {
    expect(suggestDepositAmount(options, 250000)).toBe(100000);
  });

  it('is null without options', () => {
    expect(suggestDepositAmount([], 10000)).toBeNull();
  });
});
