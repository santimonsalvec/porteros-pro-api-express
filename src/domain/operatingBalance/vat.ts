/** VAT charged on top of the platform's net (feature 023, research.md §4). Integers only. */

export const BPS = 10_000;

/**
 * A basis-point share of a whole-unit amount, rounded half up to whole currency units. The one
 * rounding every charge the platform makes shares: the VAT (feature 023) and the percentage
 * component of a commission (feature 033).
 */
export function bpsOf(base: number, bps: number): number {
  if (!Number.isInteger(base) || base < 0) throw new Error('bpsOf: base must be a non-negative integer');
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS) throw new Error('bpsOf: bps must be an integer 0–10000');
  return Math.floor((base * bps * 2 + BPS) / (2 * BPS));
}

/** The VAT of a base at a rate in basis points, rounded half up to whole currency units. */
export function vatFor(base: number, rateBps: number): number {
  if (!Number.isInteger(base) || base < 0) throw new Error('vatFor: base must be a non-negative integer');
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > BPS) throw new Error('vatFor: rateBps must be an integer 0–10000');
  return bpsOf(base, rateBps);
}

/** What a commission (or penalty) really takes from the operating balance: the net plus its VAT. */
export function grossCharge(net: number, rateBps: number): number {
  return net + vatFor(net, rateBps);
}
