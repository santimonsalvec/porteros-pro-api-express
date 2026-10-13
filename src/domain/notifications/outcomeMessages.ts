import type { PushMessage } from '../devices/deviceRules.js';
import { localWhen } from './offerMessages.js';

/** Inbox and push types of how a request or booking ended (feature 016). */
export const REQUEST_EXPIRED_TYPE = 'request.expired';
export const REQUEST_PARTIALLY_EXPIRED_TYPE = 'request.partially_expired';
export const REQUEST_CANCELLED_TYPE = 'request.cancelled';
export const BOOKING_CANCELLED_TYPE = 'booking.cancelled';

export interface OutcomeMatch {
  zoneName: string | null;
  cityName: string | null;
  startsAt: Date;
  timeZone: string;
}

/** "en Bello · dom 4 oct, 3:00 p. m." */
export function where(match: OutcomeMatch): string {
  return `en ${match.zoneName ?? match.cityName ?? 'tu zona'} · ${localWhen(match.startsAt, match.timeZone)}`;
}

/** "7.000 COP": Colombian thousands separator, whole units. */
export function formatAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount)} ${currency}`.replace(/\s/g, ' ');
}

export function requestExpiredMessage(match: OutcomeMatch, requestId: string): PushMessage {
  return {
    title: 'Sin portero para tu partido',
    body: `No logramos hallar un portero para tu partido ${where(match)}`,
    data: { type: REQUEST_EXPIRED_TYPE, requestId },
  };
}

export function requestPartiallyExpiredMessage(match: OutcomeMatch, requestId: string, assigned: number, total: number): PushMessage {
  return {
    title: 'Portero confirmado parcialmente',
    body: `Conseguimos ${assigned} de ${total} porteros para tu partido ${where(match)}`,
    data: { type: REQUEST_PARTIALLY_EXPIRED_TYPE, requestId },
  };
}

export function requestCancelledMessage(match: OutcomeMatch, requestId: string): PushMessage {
  return {
    title: 'Solicitud cancelada',
    body: `Cancelamos tu solicitud ${where(match)}: no se confirmaron todos los porteros a tiempo.`,
    data: { type: REQUEST_CANCELLED_TYPE, requestId },
  };
}

export function bookingCancelledMessage(
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  refund: { amount: number; currency: string } | null,
  by: 'system' | 'client' | 'admin' = 'system',
): PushMessage {
  // The time already ends in "a. m." / "p. m.", so no extra period after it.
  const refunded = refund ? ` Te devolvimos ${formatAmount(refund.amount, refund.currency)}.` : '';
  const what = by === 'client' ? 'El cliente canceló tu partido' : by === 'admin' ? 'PorterosPRO canceló tu partido' : 'Se canceló tu partido';
  return {
    title: 'Partido cancelado',
    body: `${what} ${where(match)}${refunded}`,
    data: { type: BOOKING_CANCELLED_TYPE, requestId, bookingId },
  };
}

/**
 * Tells the client an administrator cancelled their match, or one of its goalkeepers when others
 * remain (admin spec 006). The administrator's reason is internal and never goes in it.
 */
export function adminCancelledMessage(
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  { remaining }: { remaining: number },
): PushMessage {
  const whole = remaining === 0;
  return {
    title: whole ? 'Partido cancelado' : 'Portero cancelado',
    body: whole ? `PorterosPRO canceló tu partido ${where(match)}` : `PorterosPRO canceló uno de los porteros de tu partido ${where(match)}`,
    data: { type: BOOKING_CANCELLED_TYPE, requestId, bookingId },
  };
}
