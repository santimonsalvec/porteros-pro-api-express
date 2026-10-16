/**
 * What the admin web sees of a user (admin spec 005, contracts/users-goalkeepers-api.md §1–§2).
 * The WhatsApp number is never part of these views: it has its own audited read.
 */

/** A staff member named in a view: their user id and display name. */
export interface MemberRef {
  userId: string;
  name: string;
}

export interface UserRow {
  id: string;
  /** "First Last"; the Google name before the profile is complete; `null` without either. */
  name: string | null;
  email: string;
  /** ISO code of the country of the user's calling code, when known. */
  countryCode: string | null;
  createdAt: string;
  isProfileComplete: boolean;
  isGoalkeeper: boolean;
  blocked: boolean;
}

export interface UserBlockView {
  blocked: boolean;
  blockedAt: string | null;
  blockedBy: MemberRef | null;
  blockReason: string | null;
  unblockedAt: string | null;
  unblockedBy: MemberRef | null;
  unblockReason: string | null;
}

export interface UserDetail extends UserRow {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  countryCallingCode: string | null;
  /** The fingerprint a correction sends back (research §9). */
  version: string;
  /** `null` when the user was never blocked. */
  block: UserBlockView | null;
  terms: { version: string; acceptedAt: string }[];
  devices: { platform: string; lastSeenAt: string }[];
  requestCount: number;
  /** `closing`: asked to leave and inactive; `closed`: logically deleted (feature 029). */
  accountState: 'active' | 'closing' | 'closed';
  /** The open request, to link to it; `null` unless `closing`. */
  openClosureId: string | null;
}

/** A request or booking listed before blocking someone, on its city's clock. */
export interface ScheduledItem {
  id: string;
  requestId?: string;
  startsAt: string;
  marketName: string | null;
  timeZone: string | null;
}

export interface BlockImpact {
  isGoalkeeper: boolean;
  /** `null` when the user is not a goalkeeper. */
  availableForOffers: boolean | null;
  openRequests: { total: number; items: ScheduledItem[] };
  upcomingBookings: { total: number; items: ScheduledItem[] };
}

/** What a block or unblock answers, and what its audit entry keeps. */
export interface UserBlockResult {
  userId: string;
  blocked: boolean;
  blockedAt: string | null;
  unblockedAt: string | null;
  reason: string;
  /** After the change; `null` when the user is not a goalkeeper. */
  availableForOffers: boolean | null;
}
