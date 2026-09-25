import type { SurchargeTier } from '../../../../domain/pricing/bookingSettings.js';
import type { RentalRate } from '../../../../domain/pricing/rentalRate.js';

/** Zone rate wins; otherwise the city rate; otherwise `null` (never treated as free). */
export function selectUnitRate(rates: { zone: RentalRate | null; city: RentalRate | null }): RentalRate | null {
  return rates.zone ?? rates.city ?? null;
}

/**
 * The tier whose range contains the lead time: `fromMinutes` inclusive, `toMinutes`
 * exclusive, `null` = unbounded. `leadMinutes` is real elapsed time, fractional, so
 * 59 min 59 s is still "less than 60". No matching tier (a configured gap) ⇒ `null`.
 */
export function selectSurchargeTier(tiers: SurchargeTier[], leadMinutes: number): SurchargeTier | null {
  return tiers.find((tier) => leadMinutes >= tier.fromMinutes && (tier.toMinutes === null || leadMinutes < tier.toMinutes)) ?? null;
}

/**
 * Integer arithmetic only. Both the rate and the lead-time surcharge are charged PER GOALKEEPER:
 * with two goalkeepers the surcharge is paid twice, so `total = (unitRate + unitSurcharge) × goalkeepers`.
 */
export function computeAmounts(
  unitRate: number,
  goalkeeperCount: number,
  unitSurcharge: number,
): { subtotal: number; surcharge: number; total: number } {
  const subtotal = unitRate * goalkeeperCount;
  const surcharge = unitSurcharge * goalkeeperCount;
  return { subtotal, surcharge, total: subtotal + surcharge };
}
