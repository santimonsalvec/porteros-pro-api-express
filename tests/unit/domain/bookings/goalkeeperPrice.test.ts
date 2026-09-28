import { describe, expect, it } from 'vitest';
import { GoalkeeperPrice } from '../../../../src/domain/bookings/goalkeeperPrice.js';

const valid = { unitRate: 55000, unitSurcharge: 5000, total: 60000, currency: 'COP' };

describe('GoalkeeperPrice', () => {
  it('accepts a consistent price', () => {
    expect(new GoalkeeperPrice(valid)).toEqual(valid);
  });

  it.each([
    ['a zero unit rate', { unitRate: 0, total: 5000 }, /unitRate/],
    ['a fractional unit rate', { unitRate: 1.5, total: 5001.5 }, /unitRate/],
    ['a negative surcharge', { unitSurcharge: -1, total: 54999 }, /unitSurcharge/],
    ['a total that does not add up', { total: 59999 }, /total/],
    ['a lower-case currency', { currency: 'cop' }, /currency/],
  ])('rejects %s', (_label, change, message) => {
    expect(() => new GoalkeeperPrice({ ...valid, ...change })).toThrow(message);
  });
});
