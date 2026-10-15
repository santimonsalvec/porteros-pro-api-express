import { describe, expect, it } from 'vitest';
import { qualifiesForReputation, REPUTATION_MIN_RATINGS } from '../../../../src/domain/goalkeepers/reputation.js';

describe('reputation (admin spec 030, FR-012)', () => {
  it('needs 5 rated services with an average strictly above 4.0', () => {
    expect(REPUTATION_MIN_RATINGS).toBe(5);
    expect(qualifiesForReputation({ count: 5, average: 4.01 })).toBe(true);
    expect(qualifiesForReputation({ count: 12, average: 4.6 })).toBe(true);
  });

  it.each([
    ['an average of exactly 4.0', { count: 5, average: 4 }],
    ['only 4 ratings, all 5 stars', { count: 4, average: 5 }],
    ['no ratings', { count: 0, average: null }],
  ])('is not enough with %s', (_label, summary) => {
    expect(qualifiesForReputation(summary)).toBe(false);
  });
});
