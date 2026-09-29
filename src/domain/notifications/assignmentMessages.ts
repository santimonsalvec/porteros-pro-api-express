import type { PushMessage } from '../devices/deviceRules.js';
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
function describe(contact: PersonContact, fallback: string): string {
  const name = [contact.firstName, contact.lastName].filter((part) => part && part.trim() !== '').join(' ') || fallback;
  return contact.whatsApp ? `${name} · WhatsApp ${contact.whatsApp}` : name;
}

/** "A y B", "A, B y C". */
function list(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * A goalkeeper took one booking and others are still searching. `contact` only when the booking
 * was taken in the last hour, where contacts are already visible (clarification 4).
 */
export function goalkeeperAssignedMessage(
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  options: { replacement: boolean; contact: PersonContact | null },
): PushMessage {
  // The time already ends in "a. m." / "p. m.", so no extra period after it.
  const lead = options.replacement ? `Encontramos otro portero para tu partido ${where(match)}` : `Un portero tomó tu partido ${where(match)}`;
  const who = options.contact ? ` Es ${describe(options.contact, 'tu portero')}.` : '';
  return {
    title: options.replacement ? 'Encontramos otro portero' : 'Portero confirmado',
    body: `${lead}${who} Seguimos buscando el otro.`,
    data: { type: GOALKEEPER_ASSIGNED_TYPE, requestId, bookingId },
  };
}

/**
 * The request has all its goalkeepers. `contacts` null while they aren't visible yet; otherwise
 * the goalkeepers taken in the last hour (clarification 4).
 */
export function requestCompleteMessage(
  match: OutcomeMatch,
  requestId: string,
  bookingId: string,
  goalkeeperCount: number,
  contacts: readonly PersonContact[] | null,
): PushMessage {
  const lead = goalkeeperCount > 1 ? `¡Listo! Tus ${goalkeeperCount} porteros están confirmados` : '¡Listo! Tu portero está confirmado';
  const tail =
    contacts && contacts.length > 0
      ? ` ${goalkeeperCount > 1 ? 'Son' : 'Es'} ${list(contacts.map((contact) => describe(contact, 'tu portero')))}.`
      : ` Verás sus datos 1 hora antes.`;
  return {
    title: 'Solicitud completa',
    body: `${lead} para el partido ${where(match)}${tail}`,
    data: { type: REQUEST_COMPLETE_TYPE, requestId, bookingId },
  };
}

/** One hour before: to the client, who their goalkeepers are. */
export function contactsVisibleMessage(match: OutcomeMatch, requestId: string, contacts: readonly PersonContact[]): PushMessage {
  const many = contacts.length > 1;
  return {
    title: many ? 'Tus porteros' : 'Tu portero',
    body: `${many ? 'Tus porteros' : 'Tu portero'} para el partido ${where(match)}: ${list(contacts.map((contact) => describe(contact, 'tu portero')))}.`,
    data: { type: CONTACTS_VISIBLE_TYPE, requestId },
  };
}

/** One hour before: to a goalkeeper, who the client is. */
export function clientContactVisibleMessage(match: OutcomeMatch, requestId: string, bookingId: string, contact: PersonContact): PushMessage {
  return {
    title: 'Tu cliente',
    body: `Tu cliente para el partido ${where(match)}: ${describe(contact, 'el cliente')}.`,
    data: { type: CLIENT_CONTACT_VISIBLE_TYPE, requestId, bookingId },
  };
}
