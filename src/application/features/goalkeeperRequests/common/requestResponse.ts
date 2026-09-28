import type { Booking } from '../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { requestStatusOf } from '../../../../domain/bookings/requestStatus.js';

/** One goalkeeper's place in a request, as the API returns it (contracts/confirm-request.md). */
export interface BookingItemResponse {
  bookingId: string;
  status: string;
  unitRate: number;
  unitSurcharge: number;
  total: number;
  currency: string;
  createdAt: string;
}

/** A request with its bookings: match and quoted price flattened, bookings nested. */
export interface RequestResponse {
  requestId: string;
  quoteId: string;
  status: string;
  partialFulfillment: string;
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
  cancellation: { freeCancellationUntil: string; freeCancellationAvailable: boolean };
  createdAt: string;
  bookings: BookingItemResponse[];
}

/** A `GET /bookings` item: the request plus the current zone and city names (contracts/list-requests.md). */
export interface ListedRequestResponse extends RequestResponse {
  /** `null` when the zone no longer exists. */
  zoneName: string | null;
  /** `null` when the city no longer exists. */
  cityName: string | null;
}

/** `now` decides whether free cancellation is still available (FR-015). */
export function toRequestResponse(request: GoalkeeperRequest, bookings: readonly Booking[], now: Date): RequestResponse {
  const { match, pricing } = request;
  const ordered = [...bookings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    requestId: request.id,
    quoteId: request.quoteId,
    status: requestStatusOf(ordered),
    partialFulfillment: request.partialFulfillment,
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
    cancellation: {
      freeCancellationUntil: request.freeCancellationUntil().toISOString(),
      freeCancellationAvailable: request.canCancelFreeAt(now),
    },
    createdAt: request.createdAt.toISOString(),
    bookings: ordered.map((booking) => ({
      bookingId: booking.id,
      status: booking.status,
      unitRate: booking.price.unitRate,
      unitSurcharge: booking.price.unitSurcharge,
      total: booking.price.total,
      currency: booking.price.currency,
      createdAt: booking.createdAt.toISOString(),
    })),
  };
}
