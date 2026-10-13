/**
 * The admin's ports for users (admin spec 005). Reads that need joins or a search go through
 * `IUserAdminReader`; the block lives in its own collection behind `IUserBlockRepository`, so the
 * app's `replaceOne` of `users` can never erase it (research §1).
 */

export interface UserBlockRecord {
  userId: string;
  blocked: boolean;
  blockedAt: Date | null;
  /** The staff member's user id. */
  blockedBy: string | null;
  blockReason: string | null;
  unblockedAt: Date | null;
  unblockedBy: string | null;
  unblockReason: string | null;
  revision: number;
}

/** `unchanged`: the user already was in that state; nothing was written (FR-028). */
export type BlockWriteResult = { outcome: 'changed' | 'unchanged'; record: UserBlockRecord };

export interface IUserBlockRepository {
  findByUserId(userId: string): Promise<UserBlockRecord | null>;
  findByUserIds(userIds: readonly string[]): Promise<Map<string, UserBlockRecord>>;
  block(userId: string, by: string, reason: string, at: Date): Promise<BlockWriteResult>;
  unblock(userId: string, by: string, reason: string, at: Date): Promise<BlockWriteResult>;
}

export interface UserListFilter {
  q?: string;
  role?: 'client' | 'goalkeeper';
  /** The stored calling code (`+57`), resolved from the country by the query. */
  countryCallingCode?: string;
  createdFrom?: Date;
  /** Exclusive. */
  createdTo?: Date;
  blocked?: boolean;
  page: number;
  pageSize: number;
}

/** A user as the list reads it: never the phone number. */
export interface UserListRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string;
  countryCallingCode: string | null;
  createdAt: Date;
  isProfileComplete: boolean;
  isGoalkeeper: boolean;
  blocked: boolean;
}

export interface ScheduledRecord {
  id: string;
  requestId?: string;
  startsAt: Date;
  zoneId: string | null;
}

export interface IUserAdminReader {
  list(filter: UserListFilter): Promise<{ items: UserListRecord[]; totalItems: number }>;
  /** The ids of the users a search finds, at most `limit` (to filter another list by them). */
  findIds(q: string, limit: number): Promise<string[]>;
  /** Newest first. */
  terms(userId: string): Promise<{ version: string; acceptedAt: Date }[]>;
  /** Most recent first; never the push token. */
  devices(userId: string): Promise<{ platform: string; lastSeenAt: Date }[]>;
  requestCount(userId: string): Promise<number>;
  /** The client's requests still open and not started yet, soonest first. */
  openRequests(userId: string, now: Date, limit: number): Promise<{ total: number; items: ScheduledRecord[] }>;
}

/** The contact fields a correction compares and writes. */
export interface ContactFields {
  firstName: string | null;
  lastName: string | null;
  countryCallingCode: string | null;
  whatsAppNumber: string | null;
  normalizedPhoneNumber: string | null;
}

/** `stale`: the user changed since it was read; `duplicate`: another user has the phone number. */
export type ContactWriteResult = 'saved' | 'stale' | 'duplicate';

/**
 * Writes an administrator's correction of a user's contact only if it still has the values read
 * (research §9): the app replaces whole user documents, so there is no `revision` to compare.
 */
export interface IUserContactWriter {
  updateContactIfUnchanged(userId: string, expected: Omit<ContactFields, 'whatsAppNumber'>, next: ContactFields): Promise<ContactWriteResult>;
}
