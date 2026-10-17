import type { Modality } from '../../bookings/matchFormat.js';
import type { Language } from '../language.js';
import { es } from './es.js';
import { en } from './en.js';

/** A notice's title and body, as the inbox keeps them and the push shows them. */
export interface Text {
  title: string;
  body: string;
}

/** A page of the payment return (feature 022): its heading and its first paragraph. */
export interface Page {
  title: string;
  detail: string;
}

/**
 * Every sentence the server writes to a person (feature 032, research §10): notices, the payment
 * return page, the test push. One member per message; the builders in `domain/notifications`
 * compose the pieces (place, time, amounts, names) and the catalog words them. Spanish is the
 * reference text; English must have the same members with the same parameters.
 */
export interface MessageCatalog {
  /** How a push names each modality (feature 024); `any` reads as an open match. */
  modality(modality: Modality): string;
  /** The place when neither the zone nor the market is known. */
  yourZone: string;
  /** "en Bello · dom 4 oct, 3:00 p. m." — the phrase every match notice places itself with. */
  where(place: string, when: string): string;

  singleOffer(args: { modality: string | null; place: string; when: string; durationMinutes: number; surfaceName: string | null }): Text;
  groupedOffer(count: number): Text;

  requestExpired(where: string): Text;
  requestPartiallyExpired(where: string, assigned: number, total: number): Text;
  requestCancelled(where: string): Text;
  bookingCancelled(where: string, by: 'system' | 'client' | 'admin', refund: string | null): Text;
  adminCancelled(where: string, whole: boolean): Text;

  /** Fallbacks when a person has no name. */
  yourGoalkeeper: string;
  theClient: string;
  /** "A y B", "A, B y C". */
  list(items: readonly string[]): string;
  goalkeeperAssigned(where: string, replacement: boolean, contact: string | null): Text;
  requestComplete(where: string, goalkeeperCount: number, contacts: readonly string[] | null): Text;
  contactsVisible(where: string, contacts: readonly string[]): Text;
  clientContactVisible(where: string, contact: string): Text;

  goalkeeperArrived(where: string): Text;
  checkInMissed(where: string, name: string, whatsApp: string | null): Text;
  checkInOpen(where: string): Text;
  checkInLastCall(where: string): Text;
  noShow(where: string, suspendedUntil: string | null): Text;

  goalkeeperWithdrew(where: string, replaced: boolean): Text;
  goalkeeperSuspended(until: string): Text;

  validated(): Text;
  validationRejected(reason: string): Text;
  verified(): Text;

  depositApproved(net: string, balance: string): Text;
  depositFailed(amount: string): Text;
  operatingBalanceAdjusted(signedAmount: string, reason: string, balance: string): Text;

  closureRequested(): Text;
  closureDebtDeposit(debt: string): Text;
  closureRefund(amount: string | null): Text;
  closureClosed(): Text;
  closureRejected(reason: string): Text;

  testPush(): Text;

  depositNotFoundPage(): Page;
  depositApprovedPage(net: string): Page;
  depositPendingPage(): Page;
  depositFailedPage(): Page;
  /** "Monto: 20.000 COP · Recibes: 18.536 COP" */
  amountsLine(amount: string, net: string): string;
  /** The return page's button, and the line shown when no app address is configured. */
  backToApp: string;
  backToAppNoButton: string;
}

const CATALOGS: Record<Language, MessageCatalog> = { es, en };

/** The sentences in `language`. */
export function catalog(language: Language): MessageCatalog {
  return CATALOGS[language];
}
