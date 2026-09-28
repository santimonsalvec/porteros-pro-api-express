import type { Booking } from './booking.js';

export type RequestStatus = 'searching' | 'partially_assigned' | 'assigned' | 'completed' | 'closed';

/**
 * A request's overall status, always derived from its bookings so it can never contradict them
 * (research.md §7).
 */
export function requestStatusOf(bookings: readonly Booking[]): RequestStatus {
  const pending = bookings.filter((booking) => booking.status === 'pending_assignment').length;
  const assigned = bookings.filter((booking) => booking.status === 'assigned').length;
  if (pending > 0) return assigned > 0 ? 'partially_assigned' : 'searching';
  if (assigned > 0) return 'assigned';
  return bookings.some((booking) => booking.status === 'completed') ? 'completed' : 'closed';
}
