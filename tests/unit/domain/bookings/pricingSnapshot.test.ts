import { describe, expect, it } from 'vitest';
import { PricingSnapshot } from '../../../../src/domain/bookings/pricingSnapshot.js';

// The contract worked example: 2 goalkeepers × (55.000 + 5.000) = 120.000 COP.
const valid = {
  unitRate: 55000,
  subtotal: 110000,
  unitSurcharge: 5000,
  surcharge: 10000,
  total: 120000,
  currency: 'COP',
};

describe('PricingSnapshot', () => {
  it('accepts a consistent breakdown', () => {
    const pricing = new PricingSnapshot(valid, 2);

    expect(pricing).toMatchObject(valid);
  });

  it('accepts a zero surcharge', () => {
    expect(
      () => new PricingSnapshot({ ...valid, unitSurcharge: 0, surcharge: 0, total: 110000 }, 2),
    ).not.toThrow();
  });

  it.each([
    ['subtotal is not unitRate × goalkeeperCount', { subtotal: 55000, total: 65000 }],
    ['surcharge is not unitSurcharge × goalkeeperCount', { surcharge: 5000, total: 115000 }],
    ['total is not subtotal + surcharge', { total: 110000 }],
    ['an amount is not an integer', { unitRate: 55000.5 }],
    ['an amount is negative', { unitSurcharge: -5000, surcharge: -10000, total: 100000 }],
    ['unitRate is zero', { unitRate: 0, subtotal: 0, total: 10000 }],
    ['the currency is lower-case', { currency: 'cop' }],
    ['the currency is not 3 letters', { currency: 'PESO' }],
  ])('rejects a breakdown where %s', (_label, override) => {
    expect(() => new PricingSnapshot({ ...valid, ...override }, 2)).toThrow();
  });
});
