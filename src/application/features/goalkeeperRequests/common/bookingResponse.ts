import type { Booking } from '../../../../domain/bookings/booking.js';

/** The booking as the API returns it: match and price flattened (contracts/create-booking.md). */
export interface BookingResponse {
  bookingId: string;
  quoteId: string;
  status: string;
  latitude: number;
  longitude: number;
  zoneId: string;
  cityId: string;
  startsAt: string;
  startsAtLocal: string;
  timeZone: string;
  goalkeeperCount: number;
  durationMinutes: number;
  unitRate: number;
  subtotal: number;
  unitSurcharge: number;
  surcharge: number;
  total: number;
  currency: string;
  createdAt: string;
}

export function toBookingResponse(booking: Booking): BookingResponse {
  const { match, pricing } = booking;
  return {
    bookingId: booking.id,
    quoteId: booking.quoteId,
    status: booking.status,
    latitude: match.latitude,
    longitude: match.longitude,
    zoneId: match.zoneId,
    cityId: match.cityId,
    startsAt: match.startsAt.toISOString(),
    startsAtLocal: match.startsAtLocal,
    timeZone: match.timeZone,
    goalkeeperCount: match.goalkeeperCount,
    durationMinutes: match.durationMinutes,
    unitRate: pricing.unitRate,
    subtotal: pricing.subtotal,
    unitSurcharge: pricing.unitSurcharge,
    surcharge: pricing.surcharge,
    total: pricing.total,
    currency: pricing.currency,
    createdAt: booking.createdAt.toISOString(),
  };
}
