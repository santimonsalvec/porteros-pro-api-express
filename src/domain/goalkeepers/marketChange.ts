import type { MarketStatus } from '../markets/market.js';

/** Where the goalkeeper plays now and where they want to play (spec 031, FR-025–FR-028). */
export interface MarketChangeTarget {
  currentMarketId: string;
  currentCountryId: string;
  /** `null` when the market does not exist. */
  target: { id: string; countryId: string; status: MarketStatus } | null;
}

/** What the goalkeeper still has open, read inside the change's transaction. */
export interface MarketChangeFacts {
  /** Bookings they accepted and have not played yet. */
  assignedBookingIds: string[];
  /** `null` when they have no operating balance yet. */
  balance: number | null;
  currency: string | null;
  pendingDepositId: string | null;
  closureOpen: boolean;
}

export type MarketChangeRefusal =
  | { kind: 'market_not_available' }
  | { kind: 'same_market' }
  | { kind: 'pending_bookings'; bookingIds: string[] }
  | { kind: 'balance_not_zero'; balance: number; currency: string }
  | { kind: 'deposit_pending'; depositId: string }
  | { kind: 'account_closure_open' };

/**
 * Why a goalkeeper may not move to another market now, or `null` (data-model §7). The money rules
 * apply only across countries: the operating balance then changes currency, which is only sound
 * with nothing in it and nothing about to arrive.
 */
export function marketChangeRefusal(change: MarketChangeTarget, facts: MarketChangeFacts): MarketChangeRefusal | null {
  const { target } = change;
  if (!target || target.status !== 'enabled') return { kind: 'market_not_available' };
  if (target.id === change.currentMarketId) return { kind: 'same_market' };
  if (facts.assignedBookingIds.length > 0) return { kind: 'pending_bookings', bookingIds: [...facts.assignedBookingIds] };
  if (target.countryId === change.currentCountryId) return null;
  if (facts.balance !== null && facts.balance !== 0) return { kind: 'balance_not_zero', balance: facts.balance, currency: facts.currency ?? '' };
  if (facts.pendingDepositId) return { kind: 'deposit_pending', depositId: facts.pendingDepositId };
  if (facts.closureOpen) return { kind: 'account_closure_open' };
  return null;
}

/** Whether the change moves the goalkeeper to another country, so their balance changes currency. */
export const changesCountry = (change: MarketChangeTarget): boolean => change.target !== null && change.target.countryId !== change.currentCountryId;
