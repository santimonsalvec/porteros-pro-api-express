import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { localWhen } from './offerMessages.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push types of a goalkeeper's withdrawal (feature 018). */
export const GOALKEEPER_WITHDREW_TYPE = 'booking.goalkeeper_withdrew';
export const GOALKEEPER_SUSPENDED_TYPE = 'goalkeeper.suspended';

/** To the client: their goalkeeper withdrew, and whether another one is being searched. */
export function goalkeeperWithdrewMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string, replaced: boolean): PushMessage {
  return { ...catalog(language).goalkeeperWithdrew(where(match, language), replaced), data: { type: GOALKEEPER_WITHDREW_TYPE, requestId, bookingId } };
}

/** To the goalkeeper: a withdrawal suspended them, until when (local time). */
export function goalkeeperSuspendedMessage(language: Language, until: Date, timeZone: string, requestId: string, bookingId: string): PushMessage {
  return {
    ...catalog(language).goalkeeperSuspended(localWhen(until, timeZone, language)),
    data: { type: GOALKEEPER_SUSPENDED_TYPE, requestId, bookingId, suspendedUntil: until.toISOString() },
  };
}
