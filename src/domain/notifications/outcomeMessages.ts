import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { localWhen } from './offerMessages.js';

/** Inbox and push types of how a request or booking ended (feature 016). */
export const REQUEST_EXPIRED_TYPE = 'request.expired';
export const REQUEST_PARTIALLY_EXPIRED_TYPE = 'request.partially_expired';
export const REQUEST_CANCELLED_TYPE = 'request.cancelled';
export const BOOKING_CANCELLED_TYPE = 'booking.cancelled';

export interface OutcomeMatch {
  zoneName: string | null;
  marketName: string | null;
  startsAt: Date;
  timeZone: string;
}

/** "en Bello · dom 4 oct, 3:00 p. m." — or "in Bello · Sun, Oct 4, 3:00 PM" (feature 032). */
export function where(match: OutcomeMatch, language: Language = 'es'): string {
  const texts = catalog(language);
  return texts.where(match.zoneName ?? match.marketName ?? texts.yourZone, localWhen(match.startsAt, match.timeZone, language));
}

/** "7.000 COP": Colombian thousands separator, whole units — the market's format in every language. */
export function formatAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount)} ${currency}`.replace(/\s/g, ' ');
}

export function requestExpiredMessage(language: Language, match: OutcomeMatch, requestId: string): PushMessage {
  return { ...catalog(language).requestExpired(where(match, language)), data: { type: REQUEST_EXPIRED_TYPE, requestId } };
}

export function requestPartiallyExpiredMessage(language: Language, match: OutcomeMatch, requestId: string, assigned: number, total: number): PushMessage {
  return {
    ...catalog(language).requestPartiallyExpired(where(match, language), assigned, total),
    data: { type: REQUEST_PARTIALLY_EXPIRED_TYPE, requestId },
  };
}

export function requestCancelledMessage(language: Language, match: OutcomeMatch, requestId: string): PushMessage {
  return { ...catalog(language).requestCancelled(where(match, language)), data: { type: REQUEST_CANCELLED_TYPE, requestId } };
}

export function bookingCancelledMessage(
  language: Language,
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  refund: { amount: number; currency: string } | null,
  by: 'system' | 'client' | 'admin' = 'system',
): PushMessage {
  return {
    ...catalog(language).bookingCancelled(where(match, language), by, refund ? formatAmount(refund.amount, refund.currency) : null),
    data: { type: BOOKING_CANCELLED_TYPE, requestId, bookingId },
  };
}

/**
 * Tells the client an administrator cancelled their match, or one of its goalkeepers when others
 * remain (admin spec 006). The administrator's reason is internal and never goes in it.
 */
export function adminCancelledMessage(
  language: Language,
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  { remaining }: { remaining: number },
): PushMessage {
  return { ...catalog(language).adminCancelled(where(match, language), remaining === 0), data: { type: BOOKING_CANCELLED_TYPE, requestId, bookingId } };
}
