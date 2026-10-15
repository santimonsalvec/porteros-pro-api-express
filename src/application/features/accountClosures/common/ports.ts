import type { AccountClosure, ClosureStatus } from '../../../../domain/accountClosures/accountClosure.js';

/** The admin's list filters (feature 029). `userIds` is a name/email search resolved first. */
export interface ClosureListCriteria {
  statuses: readonly ClosureStatus[];
  userIds: readonly string[] | null;
  /** By the balance when the request was made. */
  debt: 'with' | 'without' | null;
  page: number;
  pageSize: number;
}

/** The requests to leave the platform. History is kept: a user may have several over time. */
export interface IAccountClosureRepository {
  findById(id: string): Promise<AccountClosure | null>;
  /** The request that makes the account inactive now, if any. */
  findOpenByUserId(userId: string): Promise<AccountClosure | null>;
  /** The newest request of any status, for the status screen. */
  findLatestByUserId(userId: string): Promise<AccountClosure | null>;
  /** The request that closed the account, while the user has not signed in again. */
  findClosedByUserId(userId: string): Promise<AccountClosure | null>;
  /** Which of these users have an open request. */
  openUserIds(userIds: readonly string[]): Promise<Set<string>>;
  /** `already_open` when the user has an open request (unique per user). */
  add(closure: AccountClosure): Promise<'added' | 'already_open'>;
  /** Replaces the stored closure only if it still has `expectedStatus`; `false` when it changed. */
  save(closure: AccountClosure, expectedStatus: ClosureStatus): Promise<boolean>;
  list(criteria: ClosureListCriteria): Promise<{ items: AccountClosure[]; totalItems: number }>;
}

/** A match that stops a user from closing the account, as the app shows it. */
export interface AssignedBookingBlocker {
  code: 'assigned_bookings';
  bookingId: string;
  startsAtLocal: string;
  placeName: string | null;
}

export interface PendingDepositBlocker {
  code: 'pending_deposits';
  depositId: string;
  amount: number;
  currency: string;
}

export interface OpenCaseBlocker {
  code: 'open_cases';
  caseId: string;
  type: string;
}

export type ClosureBlocker = AssignedBookingBlocker | PendingDepositBlocker | OpenCaseBlocker;

/** What stands between a user and the refund: accepted matches, pending deposits, open cases. */
export interface IClosureBlockersReader {
  forUser(userId: string, role: 'goalkeeper' | 'client'): Promise<ClosureBlocker[]>;
}
