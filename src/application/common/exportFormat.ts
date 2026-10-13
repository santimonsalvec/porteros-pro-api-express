/** The most rows one admin export may carry (admin spec 007, FR-024). */
export const EXPORT_LIMIT = 10_000;

/**
 * Where exported dates are read (admin spec 007, research §11): countries keep no time zone and only
 * Colombia operates today; each file says so in its `zona_horaria` column.
 */
export const EXPORT_TIME_ZONE = 'America/Bogota';

const FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: EXPORT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** `2026-10-13 16:15`: what a spreadsheet reads as a date and a time. */
export function exportDateTime(date: Date): string {
  const parts = Object.fromEntries(FORMAT.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
