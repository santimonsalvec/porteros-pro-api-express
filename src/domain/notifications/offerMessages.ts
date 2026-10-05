import type { PushMessage } from '../devices/deviceRules.js';
import type { MatchFormat, MatchLevel, Modality } from '../bookings/matchFormat.js';

/** How a push names each modality (feature 024); `any` reads as an open match. */
const MODALITY_LABELS: Record<Modality, string> = {
  micro_futsal: 'Micro / Futsal',
  futbol_medio: 'Fútbol medio',
  futbol_11: 'Fútbol 11',
  any: 'Abierto',
};

const LEVEL_LABELS: Record<MatchLevel, string> = { recreational: 'Amateur', competitive: 'Torneo' };

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
  cityName: string | null;
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
 * Grama sintética · Torneo", in the match's city time zone. The inbox keeps the same text.
 */
export function singleOfferMessage(match: OfferMatch): PushMessage {
  const place = match.zoneName ?? match.cityName ?? 'tu zona';
  const { format } = match;
  const details = format ? ` · ${format.surfaceName} · ${LEVEL_LABELS[format.level]}` : '';
  return {
    title: format ? `Partido disponible · ${MODALITY_LABELS[format.modality]}` : 'Partido disponible',
    body: `${place} · ${localWhen(match.startsAt, match.timeZone)} · ${match.durationMinutes} min${details}`,
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
