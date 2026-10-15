import { grossCharge } from './vat.js';

/**
 * The funds rules (FR-012), shared by every feature that lists, offers, notifies or accepts
 * matches — so they can never disagree about whether a goalkeeper can pay the commission. Since
 * feature 023 every comparison uses the commission plus its VAT (the country's rate), since both
 * are debited together.
 */

export interface OffersStatus {
  /** Rule (a): false → the goalkeeper sees no matches and receives no offers at all. */
  canSeeOffers: boolean;
  /** The lowest configured commission among the enabled zones; `null` when none is configured. */
  lowestCommission: number | null;
  /** That commission plus its VAT: what accepting such a match debits (feature 023). */
  lowestCharge: number | null;
  /** The goalkeeper's country VAT rate, in basis points. */
  vatRateBps: number;
  /** How much is missing to reach `lowestCharge` (0 when nothing is missing). */
  missingAmount: number;
}

/**
 * Rule (a): a goalkeeper sees offers only when the balance covers the lowest commission of the
 * zones they have enabled. Unconfigured zones (`null`) are ignored — they are never offered anyway.
 */
export function offersStatus(balance: number, zoneCommissions: readonly (number | null)[], vatRateBps: number): OffersStatus {
  const configured = zoneCommissions.filter((commission): commission is number => commission !== null);
  if (configured.length === 0) return { canSeeOffers: false, lowestCommission: null, lowestCharge: null, vatRateBps, missingAmount: 0 };
  const lowestCommission = Math.min(...configured);
  const lowestCharge = grossCharge(lowestCommission, vatRateBps);
  return {
    canSeeOffers: balance >= lowestCharge,
    lowestCommission,
    lowestCharge,
    vatRateBps,
    missingAmount: Math.max(0, lowestCharge - balance),
  };
}

/**
 * Rule (b): a match is affordable when its zone has a configured commission and the balance
 * covers it plus its VAT — equal counts as enough; a negative balance never does.
 */
export function canAfford(balance: number, commission: number | null, vatRateBps: number): boolean {
  return commission !== null && balance >= grossCharge(commission, vatRateBps);
}

/** How much a balance lacks to pay a commission plus its VAT (0 when it's enough). */
export function missingFor(balance: number, commission: number, vatRateBps: number): number {
  return Math.max(0, grossCharge(commission, vatRateBps) - balance);
}
