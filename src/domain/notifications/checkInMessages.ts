import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { describeContact, type PersonContact } from './assignmentMessages.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push types of feature 020. */
export const GOALKEEPER_ARRIVED_TYPE = 'booking.goalkeeper_arrived';
export const CHECK_IN_MISSED_TYPE = 'booking.check_in_missed';
export const CHECK_IN_OPEN_TYPE = 'booking.check_in_open';
export const CHECK_IN_LAST_CALL_TYPE = 'booking.check_in_last_call';

/** To the client: their goalkeeper checked in. */
export function goalkeeperArrivedMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string): PushMessage {
  return { ...catalog(language).goalkeeperArrived(where(match, language)), data: { type: GOALKEEPER_ARRIVED_TYPE, requestId, bookingId } };
}

/** To the client: no check-in by the window close, with the goalkeeper's contact to reach them. */
export function checkInMissedMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string, contact: PersonContact | null): PushMessage {
  const name = contact ? describeContact({ ...contact, whatsApp: null }, '') : '';
  return {
    ...catalog(language).checkInMissed(where(match, language), name, contact?.whatsApp ?? null),
    data: { type: CHECK_IN_MISSED_TYPE, requestId, bookingId },
  };
}

/** To the goalkeeper: the check-in window is open. */
export function checkInOpenMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string): PushMessage {
  return { ...catalog(language).checkInOpen(where(match, language)), data: { type: CHECK_IN_OPEN_TYPE, requestId, bookingId } };
}

/** To the goalkeeper: 10 minutes left to check in (clarification 2). */
export function checkInLastCallMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string): PushMessage {
  return { ...catalog(language).checkInLastCall(where(match, language)), data: { type: CHECK_IN_LAST_CALL_TYPE, requestId, bookingId } };
}
