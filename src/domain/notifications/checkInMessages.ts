import type { PushMessage } from '../devices/deviceRules.js';
import { describeContact, type PersonContact } from './assignmentMessages.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push types of feature 020. */
export const GOALKEEPER_ARRIVED_TYPE = 'booking.goalkeeper_arrived';
export const CHECK_IN_MISSED_TYPE = 'booking.check_in_missed';
export const CHECK_IN_OPEN_TYPE = 'booking.check_in_open';
export const CHECK_IN_LAST_CALL_TYPE = 'booking.check_in_last_call';

// The time from `where` already ends in "a. m." / "p. m.", so no extra period after it.

/** To the client: their goalkeeper checked in. */
export function goalkeeperArrivedMessage(match: OutcomeMatch, requestId: string, bookingId: string): PushMessage {
  return {
    title: 'Tu portero llegó',
    body: `Tu portero llegó al partido ${where(match)}`,
    data: { type: GOALKEEPER_ARRIVED_TYPE, requestId, bookingId },
  };
}

/** To the client: no check-in by the window close, with the goalkeeper's contact to reach them. */
export function checkInMissedMessage(match: OutcomeMatch, requestId: string, bookingId: string, contact: PersonContact | null): PushMessage {
  const name = contact ? describeContact({ ...contact, whatsApp: null }, '') : '';
  const reach = contact?.whatsApp ? ` Escríbele: WhatsApp ${contact.whatsApp}.` : '';
  return {
    title: 'Tu portero no ha confirmado su llegada',
    body: `${name ? `Tu portero ${name}` : 'Tu portero'} no ha confirmado su llegada al partido ${where(match)}${reach}`,
    data: { type: CHECK_IN_MISSED_TYPE, requestId, bookingId },
  };
}

/** To the goalkeeper: the check-in window is open. */
export function checkInOpenMessage(match: OutcomeMatch, requestId: string, bookingId: string): PushMessage {
  return {
    title: 'Confirma tu llegada',
    body: `Ya puedes confirmar tu llegada al partido ${where(match)} Tómate una foto en la cancha.`,
    data: { type: CHECK_IN_OPEN_TYPE, requestId, bookingId },
  };
}

/** To the goalkeeper: 10 minutes left to check in (clarification 2). */
export function checkInLastCallMessage(match: OutcomeMatch, requestId: string, bookingId: string): PushMessage {
  return {
    title: 'Te quedan 10 minutos',
    body: `Te quedan 10 minutos para confirmar tu llegada al partido ${where(match)}`,
    data: { type: CHECK_IN_LAST_CALL_TYPE, requestId, bookingId },
  };
}
