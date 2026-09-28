import { canAfford } from '../wallet/fundsPolicy.js';
import type { Booking } from './booking.js';
import { firstConflict, holdsSameRequest, type Commitment } from './schedulePolicy.js';

/** What deciding eligibility needs to know about one goalkeeper at one moment (feature 015). */
export interface OfferSnapshot {
  goalkeeperId: string;
  zoneIds: readonly string[];
  availableForOffers: boolean;
  suspendedUntil: Date | null;
  balance: number;
  /** 012's rule (a): the balance covers the lowest commission of the enabled zones. */
  canSeeOffers: boolean;
  /** The bookings the goalkeeper holds (assigned). */
  held: readonly Commitment[];
}

/**
 * Whether the goalkeeper can take the booking right now — the single rule behind "available
 * matches" (012), offers and reminders (015), so they can never disagree (FR-002).
 */
export function isEligible(snapshot: OfferSnapshot, booking: Booking, now: Date): boolean {
  if (!snapshot.availableForOffers) return false;
  if (snapshot.suspendedUntil && snapshot.suspendedUntil > now) return false;
  if (!snapshot.canSeeOffers || !canAfford(snapshot.balance, booking.commission)) return false;
  if (!snapshot.zoneIds.includes(booking.zoneId)) return false;
  if (booking.status !== 'pending_assignment' || !booking.isSearchOpenAt(now)) return false;
  if (booking.clientId === snapshot.goalkeeperId) return false;
  return !holdsSameRequest(booking, snapshot.held) && firstConflict(booking, snapshot.held) === null;
}
