import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';
import { where, type OutcomeMatch } from './outcomeMessages.js';

/** Inbox and push types of feature 019. */
export const GOALKEEPER_ASSIGNED_TYPE = 'booking.goalkeeper_assigned';
export const REQUEST_COMPLETE_TYPE = 'request.complete';
export const CONTACTS_VISIBLE_TYPE = 'request.contacts_visible';
export const CLIENT_CONTACT_VISIBLE_TYPE = 'booking.client_contact_visible';

/** What one side sees of the other once contacts are visible (name and WhatsApp only, 012). */
export interface PersonContact {
  firstName: string | null;
  lastName: string | null;
  whatsApp: string | null;
}

/** "Juan Pérez · WhatsApp +57 300 1234567", falling back to `fallback` without a name. */
export function describeContact(contact: PersonContact, fallback: string): string {
  const name = [contact.firstName, contact.lastName].filter((part) => part && part.trim() !== '').join(' ') || fallback;
  return contact.whatsApp ? `${name} · WhatsApp ${contact.whatsApp}` : name;
}

/**
 * A goalkeeper took one booking and others are still searching. `contact` only when the booking
 * was taken in the last hour, where contacts are already visible (clarification 4).
 */
export function goalkeeperAssignedMessage(
  language: Language,
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  options: { replacement: boolean; contact: PersonContact | null },
): PushMessage {
  const texts = catalog(language);
  return {
    ...texts.goalkeeperAssigned(where(match, language), options.replacement, options.contact ? describeContact(options.contact, texts.yourGoalkeeper) : null),
    data: { type: GOALKEEPER_ASSIGNED_TYPE, requestId, bookingId },
  };
}

/**
 * The request has all its goalkeepers. `contacts` null while they aren't visible yet; otherwise
 * the goalkeepers taken in the last hour (clarification 4).
 */
export function requestCompleteMessage(
  language: Language,
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  goalkeeperCount: number,
  contacts: readonly PersonContact[] | null,
): PushMessage {
  const texts = catalog(language);
  return {
    ...texts.requestComplete(where(match, language), goalkeeperCount, contacts?.map((contact) => describeContact(contact, texts.yourGoalkeeper)) ?? null),
    data: { type: REQUEST_COMPLETE_TYPE, requestId, bookingId },
  };
}

/** One hour before: to the client, who their goalkeepers are. */
export function contactsVisibleMessage(language: Language, match: OutcomeMatch, requestId: string, contacts: readonly PersonContact[]): PushMessage {
  const texts = catalog(language);
  return {
    ...texts.contactsVisible(where(match, language), contacts.map((contact) => describeContact(contact, texts.yourGoalkeeper))),
    data: { type: CONTACTS_VISIBLE_TYPE, requestId },
  };
}

/** One hour before: to a goalkeeper, who the client is. */
export function clientContactVisibleMessage(language: Language, match: OutcomeMatch, requestId: string, bookingId: string, contact: PersonContact): PushMessage {
  const texts = catalog(language);
  return {
    ...texts.clientContactVisible(where(match, language), describeContact(contact, texts.theClient)),
    data: { type: CLIENT_CONTACT_VISIBLE_TYPE, requestId, bookingId },
  };
}
