import type { Booking } from './booking.js';

export type RequestStatus = 'searching' | 'partially_assigned' | 'assigned' | 'completed' | 'cancelled' | 'expired' | 'closed';

/**
 * A request's overall status, always derived from its bookings so it can never contradict them
 * (research.md §7).
 */
export function requestStatusOf(bookings: readonly Booking[]): RequestStatus {
  const pending = bookings.filter((booking) => booking.status === 'pending_assignment').length;
  const assigned = bookings.filter((booking) => booking.status === 'assigned').length;
  if (pending > 0) return assigned > 0 ? 'partially_assigned' : 'searching';
  if (assigned > 0) return 'assigned';
  if (bookings.some((booking) => booking.status === 'completed')) return 'completed';
  // Ended without a goalkeeper (feature 016): "cancel all" wins over bookings that had expired.
  if (bookings.some((booking) => booking.status === 'cancelled')) return 'cancelled';
  if (bookings.some((booking) => booking.status === 'expired')) return 'expired';
  return 'closed';
}

/** How many of a request's bookings are in each status that decides its overall status (admin spec 006). */
export interface BookingCounts {
  pending: number;
  assigned: number;
  completed: number;
  cancelled: number;
  expired: number;
}

export function countsOf(bookings: readonly Booking[]): BookingCounts {
  const count = (status: Booking['status']) => bookings.filter((booking) => booking.status === status).length;
  return {
    pending: count('pending_assignment'),
    assigned: count('assigned'),
    completed: count('completed'),
    cancelled: count('cancelled'),
    expired: count('expired'),
  };
}

/**
 * The same rule as `requestStatusOf`, from counts: what the admin's request list can compute in
 * Mongo (research §6). A test proves both agree for every combination of up to 3 bookings.
 */
export function requestStatusFromCounts(counts: BookingCounts): RequestStatus {
  if (counts.pending > 0) return counts.assigned > 0 ? 'partially_assigned' : 'searching';
  if (counts.assigned > 0) return 'assigned';
  if (counts.completed > 0) return 'completed';
  if (counts.cancelled > 0) return 'cancelled';
  if (counts.expired > 0) return 'expired';
  return 'closed';
}
