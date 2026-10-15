import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import type { RatingSummary } from './adminViews.js';
import type { ScheduledRecord } from '../../users/common/ports.js';

/**
 * The admin's ports for goalkeepers (admin spec 005): lists and counts that need joins, read by
 * aggregations (research §5–§6). The goalkeeper's own data still comes from its repositories.
 */

export interface GoalkeeperListFilter {
  /** Only these users (a search resolved first); `undefined` = everyone. */
  userIds?: readonly string[];
  cityId?: string;
  zoneId?: string;
  suspended?: boolean;
  availableForOffers?: boolean;
  /** Balance strictly below this amount; without a operating balance the balance is 0. */
  balanceBelow?: number;
  now: Date;
  page: number;
  pageSize: number;
}

export interface GoalkeeperListRecord {
  userId: string;
  cityId: string | null;
  zoneCount: number;
  availableForOffers: boolean;
  suspendedUntil: Date | null;
  balance: number;
  currency: string | null;
  activatedAt: Date;
}

export interface IGoalkeeperAdminReader {
  list(filter: GoalkeeperListFilter): Promise<{ items: GoalkeeperListRecord[]; totalItems: number }>;
  /** The clients' ratings of each goalkeeper; absent = never rated. */
  ratingsFor(userIds: readonly string[]): Promise<Map<string, RatingSummary>>;
  incidentCounts(userId: string): Promise<{ withdrawal: number; no_show: number }>;
  /** The goalkeeper's accepted bookings not played yet, soonest first. */
  upcomingBookings(userId: string, now: Date, limit: number): Promise<{ total: number; items: ScheduledRecord[] }>;
}

export interface RegistrationListFilter {
  cityId?: string;
  /** Last activity at or before this instant. */
  updatedBefore?: Date;
}

export interface IRegistrationAdminReader {
  /** Every registration in progress (they are few), longest idle first. */
  inProgress(filter: RegistrationListFilter): Promise<GoalkeeperRegistration[]>;
}

export interface IdentityDocument {
  documentType: string;
  documentNumber: string;
}

/** `stale`: the document changed since it was read; `duplicate`: another goalkeeper has it. */
export type DocumentWriteResult = 'saved' | 'stale' | 'duplicate';

/**
 * Corrects a goalkeeper's identity document where it lives: the registration (whose unique index
 * keeps a document to one goalkeeper) and the profile (what invoicing reads), in one transaction,
 * only if the profile still has the values read (research §9, §11).
 */
export interface IGoalkeeperDocumentWriter {
  correct(userId: string, expected: IdentityDocument, next: IdentityDocument): Promise<DocumentWriteResult>;
}
