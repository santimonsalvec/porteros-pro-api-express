/**
 * The funds rules (FR-012), shared by every feature that lists, offers, notifies or accepts
 * matches — so they can never disagree about whether a goalkeeper can pay the commission.
 */

export interface OffersStatus {
  /** Rule (a): false → the goalkeeper sees no matches and receives no offers at all. */
  canSeeOffers: boolean;
  /** The lowest configured commission among the enabled zones; `null` when none is configured. */
  lowestCommission: number | null;
  /** How much is missing to reach `lowestCommission` (0 when nothing is missing). */
  missingAmount: number;
}

/**
 * Rule (a): a goalkeeper sees offers only when the balance covers the lowest commission of the
 * zones they have enabled. Unconfigured zones (`null`) are ignored — they are never offered anyway.
 */
export function offersStatus(balance: number, zoneCommissions: readonly (number | null)[]): OffersStatus {
  const configured = zoneCommissions.filter((commission): commission is number => commission !== null);
  if (configured.length === 0) return { canSeeOffers: false, lowestCommission: null, missingAmount: 0 };
  const lowestCommission = Math.min(...configured);
  return {
    canSeeOffers: balance >= lowestCommission,
    lowestCommission,
    missingAmount: Math.max(0, lowestCommission - balance),
  };
}

/**
 * Rule (b): a match is affordable when its zone has a configured commission and the balance
 * covers it — equal counts as enough; a negative balance never does (commissions are positive).
 */
export function canAfford(balance: number, commission: number | null): boolean {
  return commission !== null && balance >= commission;
}
