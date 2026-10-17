import { describe, expect, it } from 'vitest';
import { bpsOf, grossCharge, vatFor } from '../../../../src/domain/operatingBalance/vat.js';

describe('vatFor', () => {
  it.each<[number, number, number]>([
    [7000, 1900, 1330],
    [7000, 0, 0],
    [10000, 10000, 10000],
    [50, 1900, 10], // 9.5 → 10 (half up)
    [49, 1900, 9], // 9.31 → 9
    [1, 5000, 1], // 0.5 → 1
  ])('%i at %i bps is %i', (base, rate, vat) => {
    expect(vatFor(base, rate)).toBe(vat);
  });

  it('refuses a fractional base or an out-of-range rate', () => {
    expect(() => vatFor(10.5, 1900)).toThrow(/base/);
    expect(() => vatFor(7000, 10001)).toThrow(/rateBps/);
    expect(() => vatFor(7000, -1)).toThrow(/rateBps/);
  });
});

describe('grossCharge', () => {
  it('adds the VAT to the net', () => {
    expect(grossCharge(7000, 1900)).toBe(8330);
    expect(grossCharge(7000, 0)).toBe(7000);
  });
});

describe('bpsOf', () => {
  it.each<[number, number, number]>([
    [120000, 1000, 12000],
    [3, 100, 0], // 0.03 → 0
    [1005, 50, 5], // 5.025 → 5
    [50, 1900, 10], // 9.5 → 10 (half up, like vatFor)
    [120000, 0, 0],
    [120000, 10000, 120000],
  ])('%i at %i bps is %i', (base, bps, expected) => {
    expect(bpsOf(base, bps)).toBe(expected);
  });

  it('is the formula vatFor uses', () => {
    expect(vatFor(7000, 1900)).toBe(bpsOf(7000, 1900));
  });

  it('refuses a fractional or negative base and an out-of-range rate', () => {
    expect(() => bpsOf(10.5, 1000)).toThrow(/base/);
    expect(() => bpsOf(-1, 1000)).toThrow(/base/);
    expect(() => bpsOf(100, 10001)).toThrow(/bps/);
    expect(() => bpsOf(100, -1)).toThrow(/bps/);
  });
});
