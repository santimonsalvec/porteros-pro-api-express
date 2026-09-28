import type { PushMessage } from '../devices/deviceRules.js';
import { localWhen } from './offerMessages.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push types of a goalkeeper's withdrawal (feature 018). */
export const GOALKEEPER_WITHDREW_TYPE = 'booking.goalkeeper_withdrew';
export const GOALKEEPER_SUSPENDED_TYPE = 'goalkeeper.suspended';

/** To the client: their goalkeeper withdrew, and whether another one is being searched. */
export function goalkeeperWithdrewMessage(match: OutcomeMatch, requestId: string, bookingId: string, replaced: boolean): PushMessage {
  // The time already ends in "a. m." / "p. m.", so no extra period after it.
  const next = replaced ? 'Ya estamos buscando otro portero.' : 'No alcanzamos a buscar otro portero.';
  return {
    title: 'Tu portero se retiró',
    body: `Tu portero se retiró del partido ${where(match)} ${next}`,
    data: { type: GOALKEEPER_WITHDREW_TYPE, requestId, bookingId },
  };
}

/** To the goalkeeper: a withdrawal suspended them, until when (local time). */
export function goalkeeperSuspendedMessage(until: Date, timeZone: string, requestId: string, bookingId: string): PushMessage {
  return {
    title: 'Quedaste suspendido',
    body: `Quedaste suspendido hasta el ${localWhen(until, timeZone)} por retirarte de un partido. Mientras tanto no verás partidos ni recibirás ofertas.`,
    data: { type: GOALKEEPER_SUSPENDED_TYPE, requestId, bookingId, suspendedUntil: until.toISOString() },
  };
}
