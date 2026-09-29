import { describe, expect, it } from 'vitest';
import { grossCharge, vatFor } from '../../../../src/domain/wallet/vat.js';

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
