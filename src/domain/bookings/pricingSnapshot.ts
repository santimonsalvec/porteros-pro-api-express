/**
 * The exact price breakdown a client was shown. It is never recomputed after the quote is
 * issued, so the constructor insists it is internally consistent: a corrupt snapshot throws
 * rather than booking a total that does not add up.
 */
export class PricingSnapshot {
  readonly unitRate: number;
  /** `unitRate × goalkeeperCount`. */
  readonly subtotal: number;
  /** The lead-time surcharge per goalkeeper (0 when none applies). */
  readonly unitSurcharge: number;
  /** `unitSurcharge × goalkeeperCount`. */
  readonly surcharge: number;
  /** `subtotal + surcharge`. */
  readonly total: number;
  /** ISO 4217 code of the country's currency. */
  readonly currency: string;

  constructor(
    params: {
      unitRate: number;
      subtotal: number;
      unitSurcharge: number;
      surcharge: number;
      total: number;
      currency: string;
    },
    goalkeeperCount: number,
  ) {
    for (const key of ['unitRate', 'subtotal', 'unitSurcharge', 'surcharge', 'total'] as const) {
      if (!Number.isInteger(params[key]) || params[key] < 0) {
        throw new Error(`PricingSnapshot: ${key} must be a non-negative integer`);
      }
    }
    if (params.unitRate === 0) throw new Error('PricingSnapshot: unitRate must be greater than 0');
    if (params.subtotal !== params.unitRate * goalkeeperCount) {
      throw new Error('PricingSnapshot: subtotal must equal unitRate × goalkeeperCount');
    }
    if (params.surcharge !== params.unitSurcharge * goalkeeperCount) {
      throw new Error('PricingSnapshot: surcharge must equal unitSurcharge × goalkeeperCount');
    }
    if (params.total !== params.subtotal + params.surcharge) {
      throw new Error('PricingSnapshot: total must equal subtotal + surcharge');
    }
    if (typeof params.currency !== 'string' || !/^[A-Z]{3}$/.test(params.currency)) {
      throw new Error('PricingSnapshot: currency must be a 3-letter upper-case ISO 4217 code');
    }
    this.unitRate = params.unitRate;
    this.subtotal = params.subtotal;
    this.unitSurcharge = params.unitSurcharge;
    this.surcharge = params.surcharge;
    this.total = params.total;
    this.currency = params.currency;
  }
}
