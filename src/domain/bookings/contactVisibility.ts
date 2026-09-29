import type { Booking } from './booking.js';
import type { GoalkeeperRequest } from './goalkeeperRequest.js';

/**
 * When the client and the goalkeepers of a request may see each other's name and WhatsApp
 * (feature 019, clarifications 2–3): once free cancellation is over — start − 60 min in Colombia.
 * Before, they could arrange directly and the client cancel for free.
 */
export function contactsVisibleFrom(request: GoalkeeperRequest): Date {
  return request.freeCancellationUntil();
}

/** Inclusive: at the very instant free cancellation ends, contacts are visible. */
export function contactsVisibleAt(request: GoalkeeperRequest, now: Date): boolean {
  return now.getTime() >= contactsVisibleFrom(request).getTime();
}

/**
 * Nothing left searching and someone assigned: the request has all the goalkeepers it can still
 * get. Bookings that ended otherwise (cancelled, expired, withdrawn) don't count as missing.
 */
export function isRequestComplete(bookings: readonly Booking[]): boolean {
  return (
    !bookings.some((booking) => booking.status === 'pending_assignment') && bookings.some((booking) => booking.status === 'assigned')
  );
}

/**
 * Which round of replacements the request is in (feature 018): the latest replacement booking's
 * id, or null when it has none. Notices keyed by it are sent once per round.
 */
export function completionRound(bookings: readonly Booking[]): string | null {
  const latest = bookings
    .filter((booking) => booking.replacesBookingId !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))[0];
  return latest?.id ?? null;
}
