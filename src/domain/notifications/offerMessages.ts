import type { PushMessage } from '../devices/deviceRules.js';
import type { MatchFormat } from '../bookings/matchFormat.js';
import { localeOf, type Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';

/** An offer of one match (inbox type and push `data.type`). */
export const OFFER_TYPE = 'booking.available';
/** A grouped reminder: the app opens the available-matches list. */
export const OFFERS_LIST_TYPE = 'bookings.available';
/** Silent: a match offered before was taken, cancelled or expired; the app reloads its list. */
export const OFFERS_CHANGED_TYPE = 'bookings.changed';

export function offersChangedMessage(requestId: string): PushMessage {
  return { title: '', body: '', silent: true, data: { type: OFFERS_CHANGED_TYPE, requestId } };
}

export interface OfferMatch {
  zoneName: string | null;
  marketName: string | null;
  startsAt: Date;
  timeZone: string;
  durationMinutes: number;
  /** `null` for requests created before feature 024: the text then reads as before. */
  format: MatchFormat | null;
  requestId: string;
  bookingId: string;
}

/**
 * Title "Partido disponible · Fútbol 11"; body "Bello · dom 4 oct, 3:00 p. m. · 90 min ·
 * Grama sintética", in the market time zone and the goalkeeper's language (feature 032). The
 * inbox keeps the same text.
 */
export function singleOfferMessage(language: Language, match: OfferMatch): PushMessage {
  const texts = catalog(language);
  const { format } = match;
  return {
    ...texts.singleOffer({
      modality: format ? texts.modality(format.modality) : null,
      place: match.zoneName ?? match.marketName ?? texts.yourZone,
      when: localWhen(match.startsAt, match.timeZone, language),
      durationMinutes: match.durationMinutes,
      surfaceName: format?.surfaceName ?? null,
    }),
    data: { type: OFFER_TYPE, requestId: match.requestId, bookingId: match.bookingId },
  };
}

export function groupedOfferMessage(language: Language, count: number): PushMessage {
  return { ...catalog(language).groupedOffer(count), data: { type: OFFERS_LIST_TYPE } };
}

/**
 * "dom 4 oct, 3:00 p. m." (es-CO) or "Sun, Oct 4, 3:00 PM" (en-US), without the dots some ICU
 * versions add to abbreviations and with plain spaces instead of ICU's non-breaking ones, so the
 * text is stable across runtimes.
 */
export function localWhen(at: Date, timeZone: string, language: Language = 'es'): string {
  const parts = new Intl.DateTimeFormat(localeOf(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((item) => item.type === type)?.value ?? '').replace(/\s/g, ' ');
  const bare = (value: string) => value.replace(/\.$/, '');
  const time = `${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
  return language === 'en'
    ? `${bare(part('weekday'))}, ${bare(part('month'))} ${part('day')}, ${time}`
    : `${bare(part('weekday'))} ${part('day')} ${bare(part('month'))}, ${time}`;
}
