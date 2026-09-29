import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import type { Booking } from '../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import type { MovementDraft } from '../../wallet/common/ports.js';
import type { Quote } from '../../../../domain/bookings/quote.js';
import type { Country } from '../../../../domain/countries/country.js';
import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import type { RentalRate } from '../../../../domain/pricing/rentalRate.js';

/** Minimal, read-only — mirrors `IZoneRepository`'s reference-data shape. */
export interface IRentalRateRepository {
  /** At most one zone-scope and one city-scope rate for that duration. */
  findForDuration(
    zoneId: string,
    cityId: string,
    durationMinutes: number,
  ): Promise<{ zone: RentalRate | null; city: RentalRate | null }>;
}

/** Minimal, read-only. `countryId` may be `null` when it cannot be determined. */
export interface IBookingSettingsRepository {
  findFor(
    cityId: string,
    countryId: string | null,
  ): Promise<{ city: BookingSettings | null; country: BookingSettings | null }>;
}

/**
 * Read-only lookup of a country (its `currency` is the currency of every price there).
 * Deliberately narrower than `ICountryRepository`, which the existing `CountryRepository` satisfies.
 */
export interface ICountryLookup {
  getById(id: string): Promise<Country | null>;
}

/** Stored quotes. Unconfirmed ones are removed by the database's TTL, never by this system. */
export interface IQuoteRepository {
  add(quote: Quote): Promise<void>;
  /** `null` when it does not exist or belongs to another client — the two are indistinguishable. */
  findByIdForClient(quoteId: string, clientId: string): Promise<Quote | null>;
}

/** Requests (one per match). Lookups are always scoped to the client. */
export interface IGoalkeeperRequestRepository {
  /** The request created from this quote, when it belongs to this client (replays are matched on it). */
  findByQuoteForClient(quoteId: string, clientId: string): Promise<GoalkeeperRequest | null>;
  /** The client's active request for that zone and start instant, if any (at most one exists). */
  findActiveByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<GoalkeeperRequest | null>;
  /** The requests with these ids, in no particular order. */
  findByIds(ids: string[]): Promise<GoalkeeperRequest[]>;
  /** How many of the client's matches start at or after `now` (upcoming) and before it (past). */
  countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }>;
  /** The client's requests with `startsAt >= now`, soonest first (ties: id ascending). */
  findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]>;
  /** The client's requests with `startsAt < now`, most recent first (ties: id descending). */
  findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]>;
  /**
   * Active "cancel all" requests not yet evaluated whose free-cancellation period has ended
   * (feature 016), at most `cap`.
   */
  findDueForCancelAll(now: Date, cap: number): Promise<GoalkeeperRequest[]>;
  /** Active requests whose contacts became visible and weren't announced yet, not started (feature 019). */
  findDueForContactsReveal(now: Date, cap: number): Promise<GoalkeeperRequest[]>;
  /** Marks the contacts-visible notices as sent; false when another run already did. */
  markContactsRevealed(requestId: string, now: Date): Promise<boolean>;
}

/** Bookings (one per goalkeeper). */
export interface IBookingRepository {
  /** Every booking of these requests, ordered by request id, then booking id. */
  findByRequestIds(requestIds: string[]): Promise<Booking[]>;
  findById(id: string): Promise<Booking | null>;
  /**
   * Pending bookings a goalkeeper could take before the clash filter: in these zones, search still
   * open, not their own request, commission within their balance — soonest first, at most `cap`.
   */
  findAvailableCandidates(query: {
    zoneIds: string[];
    excludeClientId: string;
    maxCommission: number;
    now: Date;
    cap: number;
  }): Promise<Booking[]>;
  /** The bookings currently assigned to the goalkeeper (the commitments the clash rule checks). */
  findAssignedToGoalkeeper(goalkeeperId: string): Promise<Booking[]>;
  /** The assigned bookings of all these goalkeepers, in one read (feature 015). */
  findAssignedToGoalkeepers(goalkeeperIds: readonly string[]): Promise<Booking[]>;
  /** Pending bookings whose search has ended, oldest deadline first, at most `cap` (feature 016). */
  findDueForExpiry(now: Date, cap: number): Promise<Booking[]>;
  /** Pending bookings whose search is still open, soonest first, at most `cap` (feature 015). */
  findOpenPending(now: Date, cap: number): Promise<Booking[]>;
  /** The goalkeeper's agenda (any status): how many start at or after `now` and before it. */
  countForGoalkeeper(goalkeeperId: string, now: Date): Promise<{ upcoming: number; past: number }>;
  /** Soonest first (ties: id ascending). */
  findUpcomingForGoalkeeper(goalkeeperId: string, now: Date, skip: number, limit: number): Promise<Booking[]>;
  /** Most recent first (ties: id descending). */
  findPastForGoalkeeper(goalkeeperId: string, now: Date, skip: number, limit: number): Promise<Booking[]>;
}

export type AcceptanceResult =
  /** Assigned, charged, and `event` recorded in the same transaction (feature 013). */
  | { kind: 'accepted'; booking: Booking; event: DomainEvent }
  /** The booking was not pending, its search had ended, or it is the goalkeeper's own request. Nothing written. */
  | { kind: 'not_claimed' }
  /** The goalkeeper already holds another booking of the same request. Nothing written. */
  | { kind: 'same_request' }
  /** It clashes with a booking the goalkeeper holds. Nothing written. */
  | { kind: 'schedule_conflict'; conflictingBookingId: string }
  /** The wallet cannot cover the booking's commission. Nothing written. */
  | { kind: 'insufficient_funds'; balance: number };

/**
 * The one step that must be atomic (FR-004): claim the pending booking for the goalkeeper, check
 * it against what they already hold, and charge its commission — all or nothing.
 */
export interface IBookingAcceptanceStore {
  accept(args: {
    bookingId: string;
    goalkeeperId: string;
    now: Date;
    commissionDraft: (booking: Booking) => MovementDraft;
    /** The "goalkeeper assigned" event, recorded with the assignment (feature 013). */
    event: (booking: Booking) => DomainEvent;
  }): Promise<AcceptanceResult>;
}

export type AcceptanceOutcome =
  | 'accepted'
  | 'replayed'
  | 'already_taken'
  | 'search_ended'
  | 'zone_not_enabled'
  | 'insufficient_funds'
  | 'suspended'
  | 'not_available_for_offers'
  | 'schedule_conflict'
  | 'own_request'
  | 'same_request'
  | 'not_available'
  | 'not_a_goalkeeper';

/** Audit trail of every acceptance attempt (FR-015). */
export interface IAcceptanceAuditLogger {
  logAcceptance(entry: { outcome: AcceptanceOutcome; goalkeeperId: string; bookingId: string; requestId?: string }): void;
}

export type ClaimResult =
  /** The request, its bookings and their events were written together (feature 013). */
  | { kind: 'created'; request: GoalkeeperRequest; bookings: Booking[]; events: DomainEvent[] }
  /** No pending, unexpired quote with that id belongs to this client. Nothing was written. */
  | { kind: 'not_claimed' }
  /** A request for this quote already exists (a concurrent confirmation won). Nothing was written. */
  | { kind: 'already_requested' }
  /** The client already holds an active request for this zone and start. Nothing was written; the quote stays. */
  | { kind: 'duplicate_request'; zoneId: string; startsAt: Date };

/**
 * The one step that must be atomic: delete the client's claimable quote and insert the request
 * and its bookings built from it — all or nothing (FR-005).
 */
export interface IQuoteConfirmationStore {
  claimAndCreateRequest(
    quoteId: string,
    clientId: string,
    now: Date,
    build: (quote: Quote) => { request: GoalkeeperRequest; bookings: Booking[]; events: DomainEvent[] },
  ): Promise<ClaimResult>;
}

export type BookingConfirmationOutcome =
  | 'created'
  | 'replayed'
  | 'quote_not_found'
  | 'quote_expired'
  | 'duplicate_request'
  | 'confirmation_in_progress'
  | 'cancel_all_not_available';

/** Audit trail of every confirmation attempt (FR-024). */
export interface IBookingAuditLogger {
  logBookingConfirmation(entry: {
    outcome: BookingConfirmationOutcome;
    clientId: string;
    quoteId: string;
    requestId?: string;
    bookingIds?: string[];
  }): void;
  /** Every client cancellation attempt, whatever its outcome (feature 017). */
  logClientCancellation(entry: { outcome: string; clientId: string; requestId: string; bookingId?: string }): void;
  /** Every goalkeeper withdrawal attempt, whatever its outcome (feature 018). */
  logWithdrawal(entry: { outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }): void;
  /** Every administrator reversal attempt of a withdrawal's penalty (feature 018). */
  logPenaltyReversal(entry: { outcome: string; adminId: string; goalkeeperId: string; withdrawalId: string }): void;
}
