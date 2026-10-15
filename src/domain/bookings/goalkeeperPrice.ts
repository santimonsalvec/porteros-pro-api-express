/**
 * What one goalkeeper of a request costs: the per-goalkeeper amounts of the quote. A booking is
 * always for exactly one goalkeeper, so this is a booking's whole price.
 */
export class GoalkeeperPrice {
  readonly unitRate: number;
  /** The lead-time surcharge for this goalkeeper (0 when none applied). */
  readonly unitSurcharge: number;
  /** Private so an undiscounted price keeps the shape it always had (read through `discount`). */
  readonly #discount: number;
  /** `unitRate + unitSurcharge − discount`: what the client pays and the goalkeeper earns. */
  readonly total: number;
  /** ISO 4217 code of the country's currency. */
  readonly currency: string;

  constructor(params: { unitRate: number; unitSurcharge: number; discount?: number; total: number; currency: string }) {
    const discount = params.discount ?? 0;
    if (!Number.isInteger(params.unitRate) || params.unitRate <= 0) {
      throw new Error('GoalkeeperPrice: unitRate must be a positive integer');
    }
    if (!Number.isInteger(params.unitSurcharge) || params.unitSurcharge < 0) {
      throw new Error('GoalkeeperPrice: unitSurcharge must be a non-negative integer');
    }
    if (!Number.isInteger(discount) || discount < 0 || discount > params.unitRate + params.unitSurcharge) {
      throw new Error('GoalkeeperPrice: discount must be an integer from 0 to unitRate + unitSurcharge');
    }
    if (params.total !== params.unitRate + params.unitSurcharge - discount) {
      throw new Error('GoalkeeperPrice: total must equal unitRate + unitSurcharge − discount');
    }
    if (typeof params.currency !== 'string' || !/^[A-Z]{3}$/.test(params.currency)) {
      throw new Error('GoalkeeperPrice: currency must be a 3-letter upper-case ISO 4217 code');
    }
    this.unitRate = params.unitRate;
    this.unitSurcharge = params.unitSurcharge;
    this.#discount = discount;
    this.total = params.total;
    this.currency = params.currency;
  }

  /**
   * Taken off for a validated goalkeeper without the verification seal (admin spec 030), who
   * absorbs it: 0 for everybody else.
   */
  get discount(): number {
    return this.#discount;
  }
}

/** The same price with a discount for a goalkeeper without the seal (admin spec 030). */
export function withDiscount(price: GoalkeeperPrice, discount: number): GoalkeeperPrice {
  const full = price.unitRate + price.unitSurcharge;
  return new GoalkeeperPrice({ unitRate: price.unitRate, unitSurcharge: price.unitSurcharge, discount, total: full - discount, currency: price.currency });
}
