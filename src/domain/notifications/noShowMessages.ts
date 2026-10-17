import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { localWhen } from './offerMessages.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push type of a recorded no-show (feature 021). */
export const NO_SHOW_TYPE = 'goalkeeper.no_show';

/** To the goalkeeper: they were marked as a no-show, and until when they're suspended. */
export function noShowMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string, suspendedUntil: Date | null): PushMessage {
  return {
    ...catalog(language).noShow(where(match, language), suspendedUntil ? localWhen(suspendedUntil, match.timeZone, language) : null),
    data: { type: NO_SHOW_TYPE, requestId, bookingId },
  };
}
