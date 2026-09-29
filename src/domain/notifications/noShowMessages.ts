import type { PushMessage } from '../devices/deviceRules.js';
import { localWhen } from './offerMessages.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push type of a recorded no-show (feature 021). */
export const NO_SHOW_TYPE = 'goalkeeper.no_show';

/** To the goalkeeper: they were marked as a no-show, and until when they're suspended. */
export function noShowMessage(match: OutcomeMatch, requestId: string, bookingId: string, suspendedUntil: Date | null): PushMessage {
  // The time from `where` already ends in "a. m." / "p. m.", so no extra period after it.
  // `localWhen` also ends in "a. m." / "p. m.": no period after the suspension end either.
  const suspension = suspendedUntil ? ` Quedaste suspendido hasta el ${localWhen(suspendedUntil, match.timeZone)}` : '';
  return {
    title: 'Inasistencia registrada',
    body: `No confirmaste tu llegada al partido ${where(match)} y quedó registrado como inasistencia.${suspension}`,
    data: { type: NO_SHOW_TYPE, requestId, bookingId },
  };
}
