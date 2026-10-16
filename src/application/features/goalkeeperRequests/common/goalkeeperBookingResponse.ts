import type { VettingTier } from '../../../../domain/goalkeepers/vetting.js';
import { discountFor } from '../../../../domain/pricing/unverifiedDiscount.js';
import type { Booking } from '../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { contactsVisibleAt, contactsVisibleFrom } from '../../../../domain/bookings/contactVisibility.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { Contact } from './contacts.js';
import { toMatchFormatResponse, type MatchFormatResponse } from './matchFormatResponse.js';
import type { IGoalkeeperRequestRepository } from './ports.js';
import { checkInWindow, type CheckInWindowConfig } from '../../../../domain/bookings/checkInWindow.js';
import type { CheckInWindowResolver } from '../../bookingLifecycle/common/checkInWindowResolver.js';

/** A booking a goalkeeper can take, as listed (contracts/goalkeeper-bookings.md). No client data. */
export interface AvailableBookingItem {
  bookingId: string;
  requestId: string;
  zoneId: string;
  zoneName: string | null;
  marketId: string;
  marketName: string | null;
  startsAt: string;
  startsAtLocal: string;
  timeZone: string;
  durationMinutes: number;
  goalkeeperCount: number;
  /** Modality, level and surface (feature 024); `null` for requests created before it. */
  matchFormat: MatchFormatResponse | null;
  /** What the client pays the goalkeeper for this booking (rate + surcharge − discount). */
  earnings: number;
  /**
   * Admin spec 030: what a goalkeeper without the verification seal gives up on this booking.
   * Absent for everybody else.
   */
  discount?: { rateBps: number; amount: number };
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
  /** When the check-in window opens and closes (both included), so the app never offers it outside; null when unknown. */
  checkInOpensAt: string | null;
  checkInClosesAt: string | null;
}

/** What building items needs besides the bookings: their requests and the current names. */
export interface BookingItemContext {
  requests: Map<string, GoalkeeperRequest>;
  zoneNames: Map<string, string>;
  marketNames: Map<string, string>;
}

/** One read for the requests, one for zone names and one for city names — whatever the page size. */
export async function loadBookingItemContext(
  deps: { requestRepository: IGoalkeeperRequestRepository; zoneRepository: IZoneRepository; marketRepository: IMarketRepository },
  bookings: readonly Booking[],
): Promise<BookingItemContext> {
  if (bookings.length === 0) return { requests: new Map(), zoneNames: new Map(), marketNames: new Map() };
  const requests = await deps.requestRepository.findByIds([...new Set(bookings.map((booking) => booking.requestId))]);
  const zoneIds = [...new Set(requests.map((request) => request.match.zoneId))];
  const marketIds = [...new Set(requests.map((request) => request.match.marketId))];
  const [zones, markets] = await Promise.all([deps.zoneRepository.getManyByIds(zoneIds), deps.marketRepository.getByIds(marketIds)]);
  return {
    requests: new Map(requests.map((request) => [request.id, request])),
    zoneNames: new Map(zones.map((zone) => [zone.id, zone.name])),
    marketNames: new Map(markets.map((market) => [market.id, market.name])),
  };
}

export function toAvailableItem(booking: Booking, context: BookingItemContext, viewerTier: VettingTier = 'verified'): AvailableBookingItem {
  const request = context.requests.get(booking.requestId);
  if (!request) throw new Error(`Booking ${booking.id} references missing request ${booking.requestId}`);
  const { match } = request;
  return {
    bookingId: booking.id,
    requestId: booking.requestId,
    zoneId: match.zoneId,
    zoneName: context.zoneNames.get(match.zoneId) ?? null,
    marketId: match.marketId,
    marketName: context.marketNames.get(match.marketId) ?? null,
    startsAt: match.startsAt.toISOString(),
    startsAtLocal: match.startsAtLocal,
    timeZone: match.timeZone,
    durationMinutes: match.durationMinutes,
    goalkeeperCount: match.goalkeeperCount,
    matchFormat: toMatchFormatResponse(match.format),
    ...earningsFor(booking, viewerTier),
    commission: booking.commission,
    currency: booking.price.currency,
  };
}

/**
 * What the goalkeeper earns and, when it applies, the discount (admin spec 030): an assigned
 * booking already carries its discounted price; a pending one is discounted for a viewer without
 * the seal, as accepting it would.
 */
function earningsFor(booking: Booking, viewerTier: VettingTier): { earnings: number; discount?: { rateBps: number; amount: number } } {
  if (booking.price.discount > 0) {
    return { earnings: booking.price.total, discount: { rateBps: booking.unverifiedDiscountBps, amount: booking.price.discount } };
  }
  if (booking.status === 'pending_assignment' && viewerTier === 'validated' && booking.unverifiedDiscountBps > 0) {
    const full = booking.price.unitRate + booking.price.unitSurcharge;
    const amount = discountFor(full, booking.unverifiedDiscountBps, booking.commission);
    if (amount > 0) return { earnings: full - amount, discount: { rateBps: booking.unverifiedDiscountBps, amount } };
  }
  return { earnings: booking.price.total };
}

/** The check-in window values of each request in `context`, one country lookup per market. */
export async function loadCheckInWindows(context: BookingItemContext, resolve: CheckInWindowResolver): Promise<Map<string, CheckInWindowConfig>> {
  const requests = [...context.requests.values()];
  const configs = await Promise.all(requests.map((request) => resolve(request)));
  return new Map(requests.map((request, index) => [request.id, configs[index]!]));
}

export function toAgendaItem(
  booking: Booking,
  context: BookingItemContext,
  client: Contact | null,
  now: Date,
  windowConfig: CheckInWindowConfig | null = null,
): AgendaItem {
  const request = context.requests.get(booking.requestId)!;
  const visible = booking.status === 'assigned' && contactsVisibleAt(request, now);
  const window = windowConfig ? checkInWindow(request.match.startsAt, windowConfig) : null;
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
    checkInOpensAt: window?.opensAt.toISOString() ?? null,
    checkInClosesAt: window?.closesAt.toISOString() ?? null,
  };
}
