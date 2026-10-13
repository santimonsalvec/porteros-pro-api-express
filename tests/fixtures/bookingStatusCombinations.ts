import { BOOKING_STATUSES, type BookingStatus } from '../../src/domain/bookings/booking.js';

/**
 * Every multiset of 1 to 3 booking statuses (admin spec 006, research §6): enough to reach every
 * branch of `requestStatusOf`, used to prove the count-based status and its Mongo `$match` agree.
 */
export function bookingStatusCombinations(maxBookings = 3): BookingStatus[][] {
  const combinations: BookingStatus[][] = [];
  const grow = (prefix: BookingStatus[], from: number) => {
    if (prefix.length > 0) combinations.push(prefix);
    if (prefix.length === maxBookings) return;
    for (let index = from; index < BOOKING_STATUSES.length; index += 1) grow([...prefix, BOOKING_STATUSES[index]!], index);
  };
  grow([], 0);
  return combinations;
}
