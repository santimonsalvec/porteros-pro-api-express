import { describe, expect, it } from 'vitest';
import { ADMIN_LIMITS } from '../../../../src/domain/pricing/adminLimits.js';
import { InvalidConfigurationError } from '../../../../src/domain/pricing/invalidConfigurationError.js';
import { discountFor, effectiveDiscount, effectivePriority, MAX_UNVERIFIED_DISCOUNT_BPS, UnverifiedDiscountSetting } from '../../../../src/domain/pricing/unverifiedDiscount.js';

const setting = (scope: string, refId: string, discountBps: number) => new UnverifiedDiscountSetting({ id: `${scope}-${refId}`, scope, refId, discountBps });

describe('UnverifiedDiscountSetting (admin spec 030)', () => {
  it('holds a percentage in basis points for a country, city or zone', () => {
    expect(setting('zone', 'z-1', 1500)).toMatchObject({ scope: 'zone', refId: 'z-1', discountBps: 1500, verifiedPriorityMinutes: null, revision: 0 });
    expect(new UnverifiedDiscountSetting({ id: 'x', scope: 'country', refId: 'co', verifiedPriorityMinutes: 20 })).toMatchObject({ discountBps: null, verifiedPriorityMinutes: 20 });
  });

  it.each([
    ['an unknown scope', { scope: 'region', refId: 'r', discountBps: 100 }],
    ['no reference', { scope: 'city', refId: '', discountBps: 100 }],
    ['a negative discount', { scope: 'city', refId: 'c', discountBps: -1 }],
    ['a fraction of a basis point', { scope: 'city', refId: 'c', discountBps: 10.5 }],
    ['a negative window', { scope: 'city', refId: 'c', verifiedPriorityMinutes: -1 }],
  ])('refuses %s', (_label, params) => {
    expect(() => new UnverifiedDiscountSetting({ id: 'x', ...params })).toThrow(InvalidConfigurationError);
  });

  it('the platform caps it at 30 %, which the admin enforces', () => {
    expect(MAX_UNVERIFIED_DISCOUNT_BPS).toBe(3000);
    expect(ADMIN_LIMITS.unverifiedDiscountBps).toBe(3000);
  });
});

describe('effectiveDiscount: the most specific level wins (FR-018)', () => {
  it('zone, then city, then country, then none', () => {
    const zone = setting('zone', 'z', 1500);
    const city = setting('city', 'c', 1000);
    const country = setting('country', 'co', 500);

    expect(effectiveDiscount([zone, city, country])).toEqual({ discountBps: 1500, origin: 'zone' });
    expect(effectiveDiscount([undefined, city, country])).toEqual({ discountBps: 1000, origin: 'city' });
    expect(effectiveDiscount([undefined, undefined, country])).toEqual({ discountBps: 500, origin: 'country' });
    expect(effectiveDiscount([undefined, undefined, undefined])).toEqual({ discountBps: 0, origin: 'default' });
  });

  it('a level set to 0 % is a choice, not a gap', () => {
    expect(effectiveDiscount([setting('zone', 'z', 0), setting('city', 'c', 1000), undefined])).toEqual({ discountBps: 0, origin: 'zone' });
  });
});

describe('effectivePriority: the verified-only window, field by field (FR-015)', () => {
  it('inherits on its own, and is 15 minutes where nobody set it', () => {
    const zoneDiscountOnly = setting('zone', 'z', 1500);
    const country = new UnverifiedDiscountSetting({ id: 'c', scope: 'country', refId: 'co', verifiedPriorityMinutes: 30 });

    expect(effectivePriority([zoneDiscountOnly, undefined, country])).toEqual({ verifiedPriorityMinutes: 30, origin: 'country' });
    expect(effectivePriority([zoneDiscountOnly, undefined, undefined])).toEqual({ verifiedPriorityMinutes: 15, origin: 'default' });
    expect(effectiveDiscount([undefined, undefined, country])).toEqual({ discountBps: 0, origin: 'default' });
  });
});

describe('discountFor (research §6)', () => {
  it('takes the percentage off the total, rounding in the goalkeeper\'s favor', () => {
    expect(discountFor(60000, 1000, 7000)).toBe(6000);
    expect(discountFor(45555, 1000, 7000)).toBe(4555);
  });

  it('never leaves the goalkeeper below the commission, and is 0 without a discount', () => {
    expect(discountFor(10000, 3000, 8000)).toBe(2000);
    expect(discountFor(7000, 3000, 9000)).toBe(0);
    expect(discountFor(60000, 0, 7000)).toBe(0);
  });
});
