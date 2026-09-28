import type { PushMessage } from '../devices/deviceRules.js';

/** An offer of one match (inbox type and push `data.type`). */
export const OFFER_TYPE = 'booking.available';
/** A grouped reminder: the app opens the available-matches list. */
export const OFFERS_LIST_TYPE = 'bookings.available';

export interface OfferMatch {
  zoneName: string | null;
  cityName: string | null;
  startsAt: Date;
  timeZone: string;
  durationMinutes: number;
  requestId: string;
  bookingId: string;
}

/** "Bello · dom 4 oct, 3:00 p. m. · 90 min", in the match's city time zone. */
export function singleOfferMessage(match: OfferMatch): PushMessage {
  const place = match.zoneName ?? match.cityName ?? 'tu zona';
  return {
    title: 'Partido disponible',
    body: `${place} · ${localWhen(match.startsAt, match.timeZone)} · ${match.durationMinutes} min`,
    data: { type: OFFER_TYPE, requestId: match.requestId, bookingId: match.bookingId },
  };
}

export function groupedOfferMessage(count: number): PushMessage {
  return {
    title: 'Partidos disponibles',
    body: `Hay ${count} partidos disponibles en tus zonas`,
    data: { type: OFFERS_LIST_TYPE },
  };
}

/**
 * "dom 4 oct, 3:00 p. m." (es-CO), without the dots some ICU versions add to abbreviations and
 * with plain spaces instead of ICU's non-breaking ones, so the text is stable across runtimes.
 */
export function localWhen(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('es-CO', {
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
  return `${bare(part('weekday'))} ${part('day')} ${bare(part('month'))}, ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}
