import type { IVatRateResolver } from '../../src/application/features/wallet/common/ports.js';

/** A fixed VAT rate for every country and city (0 unless a test says otherwise). */
export function fixedVatRates(rateBps = 0): IVatRateResolver & { rateBps: number } {
  const rates = {
    rateBps,
    forCountry: async () => rates.rateBps,
    forCity: async () => rates.rateBps,
  };
  return rates;
}
