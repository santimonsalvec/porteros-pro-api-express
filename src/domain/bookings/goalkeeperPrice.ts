/**
 * What one goalkeeper of a request costs: the per-goalkeeper amounts of the quote. A booking is
 * always for exactly one goalkeeper, so this is a booking's whole price.
 */
export class GoalkeeperPrice {
  readonly unitRate: number;
  /** The lead-time surcharge for this goalkeeper (0 when none applied). */
  readonly unitSurcharge: number;
  /** `unitRate + unitSurcharge`. */
  readonly total: number;
  /** ISO 4217 code of the country's currency. */
  readonly currency: string;

  constructor(params: { unitRate: number; unitSurcharge: number; total: number; currency: string }) {
    if (!Number.isInteger(params.unitRate) || params.unitRate <= 0) {
      throw new Error('GoalkeeperPrice: unitRate must be a positive integer');
    }
    if (!Number.isInteger(params.unitSurcharge) || params.unitSurcharge < 0) {
      throw new Error('GoalkeeperPrice: unitSurcharge must be a non-negative integer');
    }
    if (params.total !== params.unitRate + params.unitSurcharge) {
      throw new Error('GoalkeeperPrice: total must equal unitRate + unitSurcharge');
    }
    if (typeof params.currency !== 'string' || !/^[A-Z]{3}$/.test(params.currency)) {
      throw new Error('GoalkeeperPrice: currency must be a 3-letter upper-case ISO 4217 code');
    }
    this.unitRate = params.unitRate;
    this.unitSurcharge = params.unitSurcharge;
    this.total = params.total;
    this.currency = params.currency;
  }
}
