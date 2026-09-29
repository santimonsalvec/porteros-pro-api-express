import type { Booking } from '../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { contactsVisibleAt, contactsVisibleFrom } from '../../../../domain/bookings/contactVisibility.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { Contact } from './contacts.js';
import type { IGoalkeeperRequestRepository } from './ports.js';

/** A booking a goalkeeper can take, as listed (contracts/goalkeeper-bookings.md). No client data. */
export interface AvailableBookingItem {
  bookingId: string;
  requestId: string;
  zoneId: string;
  zoneName: string | null;
  cityId: string;
  cityName: string | null;
  startsAt: string;
  startsAtLocal: string;
  timeZone: string;
  durationMinutes: number;
  goalkeeperCount: number;
  /** What the client pays the goalkeeper for this booking (rate + surcharge). */
  earnings: number;
  /** The platform's commission, fixed when the quote was issued. */
  commission: number;
  currency: string;
}

/** An available match with what taking it debits (feature 023): the commission plus its VAT. */
export interface AvailableListItem extends AvailableBookingItem {
  vat: number;
  totalCharge: number;
}

/** A booking in the goalkeeper's agenda: the listed fields plus status, pitch and client contact. */
export interface AgendaItem extends AvailableBookingItem {
  status: string;
  assignedAt: string | null;
  latitude: number;
  longitude: number;
  /** The client's contact: only for a booking the goalkeeper holds, from `clientContactVisibleFrom` (feature 019). */
  client: Contact | null;
  /** From when the client's name and WhatsApp are shown (start − 60 min). */
  clientContactVisibleFrom: string;
  /** The goalkeeper's check-in (feature 020), with their distance to the pitch. */
  checkIn: { at: string; photoUrl: string; distanceMeters: number | null } | null;
}

/** What building items needs besides the bookings: their requests and the current names. */
export interface BookingItemContext {
  requests: Map<string, GoalkeeperRequest>;
  zoneNames: Map<string, string>;
  cityNames: Map<string, string>;
}

/** One read for the requests, one for zone names and one for city names — whatever the page size. */
export async function loadBookingItemContext(
  deps: { requestRepository: IGoalkeeperRequestRepository; zoneRepository: IZoneRepository; cityRepository: ICityRepository },
  bookings: readonly Booking[],
): Promise<BookingItemContext> {
  if (bookings.length === 0) return { requests: new Map(), zoneNames: new Map(), cityNames: new Map() };
  const requests = await deps.requestRepository.findByIds([...new Set(bookings.map((booking) => booking.requestId))]);
  const zoneIds = [...new Set(requests.map((request) => request.match.zoneId))];
  const cityIds = [...new Set(requests.map((request) => request.match.cityId))];
  const [zones, cities] = await Promise.all([deps.zoneRepository.getManyByIds(zoneIds), deps.cityRepository.getByIds(cityIds)]);
  return {
    requests: new Map(requests.map((request) => [request.id, request])),
    zoneNames: new Map(zones.map((zone) => [zone.id, zone.name])),
    cityNames: new Map(cities.map((city) => [city.id, city.name])),
  };
}

export function toAvailableItem(booking: Booking, context: BookingItemContext): AvailableBookingItem {
  const request = context.requests.get(booking.requestId);
  if (!request) throw new Error(`Booking ${booking.id} references missing request ${booking.requestId}`);
  const { match } = request;
  return {
    bookingId: booking.id,
    requestId: booking.requestId,
    zoneId: match.zoneId,
    zoneName: context.zoneNames.get(match.zoneId) ?? null,
    cityId: match.cityId,
    cityName: context.cityNames.get(match.cityId) ?? null,
    startsAt: match.startsAt.toISOString(),
    startsAtLocal: match.startsAtLocal,
    timeZone: match.timeZone,
    durationMinutes: match.durationMinutes,
    goalkeeperCount: match.goalkeeperCount,
    earnings: booking.price.total,
    commission: booking.commission,
    currency: booking.price.currency,
  };
}

export function toAgendaItem(booking: Booking, context: BookingItemContext, client: Contact | null, now: Date): AgendaItem {
  const request = context.requests.get(booking.requestId)!;
  const visible = booking.status === 'assigned' && contactsVisibleAt(request, now);
  return {
    ...toAvailableItem(booking, context),
    status: booking.status,
    assignedAt: booking.assignedAt?.toISOString() ?? null,
    latitude: request.match.latitude,
    longitude: request.match.longitude,
    client: visible ? client : null,
    clientContactVisibleFrom: contactsVisibleFrom(request).toISOString(),
    checkIn: booking.checkIn
      ? { at: booking.checkIn.at.toISOString(), photoUrl: booking.checkIn.photoUrl, distanceMeters: booking.checkIn.distanceMeters }
      : null,
  };
}
