import { describe, expect, it } from 'vitest';
import type { SurchargeTier } from '../../../../../src/domain/pricing/bookingSettings.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import {
  computeAmounts,
  selectSurchargeTier,
  selectUnitRate,
} from '../../../../../src/application/features/goalkeeperRequests/common/pricing.js';

const colombian: SurchargeTier[] = [
  { fromMinutes: 0, toMinutes: 60, amount: 10000 },
  { fromMinutes: 60, toMinutes: 120, amount: 5000 },
  { fromMinutes: 120, toMinutes: null, amount: 0 },
];

function rate(scope: 'zone' | 'city', amount: number): RentalRate {
  return new RentalRate({ id: `${scope}-rate`, scope, refId: `${scope}-1`, durationMinutes: 60, amount });
}

describe('selectUnitRate', () => {
  it('prefers the zone rate over the city rate', () => {
    expect(selectUnitRate({ zone: rate('zone', 45000), city: rate('city', 40000) })?.amount).toBe(45000);
  });

  it('falls back to the city rate when the zone has none', () => {
    expect(selectUnitRate({ zone: null, city: rate('city', 40000) })?.amount).toBe(40000);
  });

  it('returns null — never zero — when neither level has a rate', () => {
    expect(selectUnitRate({ zone: null, city: null })).toBeNull();
  });
});

describe('selectSurchargeTier', () => {
  it.each([
    [29.99, 10000],
    [30, 10000],
    [59.99, 10000],
    [60, 5000],
    [119.99, 5000],
    [120, 0],
    [500, 0],
  ])('lead of %s minutes falls in the tier worth %s', (lead, amount) => {
    expect(selectSurchargeTier(colombian, lead)?.amount).toBe(amount);
  });

  it('applies the first tier at exactly zero minutes', () => {
    expect(selectSurchargeTier(colombian, 0)?.amount).toBe(10000);
  });

  it('returns null when no tier covers the lead time (a configured gap)', () => {
    const gappy: SurchargeTier[] = [
      { fromMinutes: 0, toMinutes: 30, amount: 10000 },
      { fromMinutes: 90, toMinutes: null, amount: 0 },
    ];
    expect(selectSurchargeTier(gappy, 60)).toBeNull();
  });

  it('honors changed boundaries', () => {
    const custom: SurchargeTier[] = [
      { fromMinutes: 0, toMinutes: 60, amount: 12000 },
      { fromMinutes: 60, toMinutes: 180, amount: 5000 },
      { fromMinutes: 180, toMinutes: null, amount: 0 },
    ];
    expect(selectSurchargeTier(custom, 150)?.amount).toBe(5000);
  });
});

describe('computeAmounts — the rate and the surcharge are both charged per goalkeeper', () => {
  it('charges neither more nor less than once per goalkeeper', () => {
    expect(computeAmounts(40000, 1, 0)).toEqual({ subtotal: 40000, surcharge: 0, total: 40000 });
    expect(computeAmounts(40000, 1, 10000)).toEqual({ subtotal: 40000, surcharge: 10000, total: 50000 });
  });

  it('charges the surcharge twice for two goalkeepers', () => {
    expect(computeAmounts(40000, 2, 10000)).toEqual({ subtotal: 80000, surcharge: 20000, total: 100000 });
    expect(computeAmounts(55000, 2, 5000)).toEqual({ subtotal: 110000, surcharge: 10000, total: 120000 });
  });

  it('a surcharge of 0 stays 0 whatever the count', () => {
    expect(computeAmounts(70000, 2, 0)).toEqual({ subtotal: 140000, surcharge: 0, total: 140000 });
  });

  it.each([
    [40000, 1, 10000],
    [40000, 2, 10000],
    [55000, 2, 5000],
    [70000, 1, 0],
    [70000, 2, 0],
  ])('keeps total = (rate + unit surcharge) x count for %s / %s / %s', (rate, count, unit) => {
    const { subtotal, surcharge, total } = computeAmounts(rate, count, unit);
    expect(subtotal).toBe(rate * count);
    expect(surcharge).toBe(unit * count);
    expect(total).toBe((rate + unit) * count);
    expect(total).toBe(subtotal + surcharge);
  });
});
