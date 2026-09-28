import type { Booking } from '../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
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
  /** How many of the client's matches start at or after `now` (upcoming) and before it (past). */
  countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }>;
  /** The client's requests with `startsAt >= now`, soonest first (ties: id ascending). */
  findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]>;
  /** The client's requests with `startsAt < now`, most recent first (ties: id descending). */
  findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]>;
}

/** Bookings (one per goalkeeper). */
export interface IBookingRepository {
  /** Every booking of these requests, ordered by request id, then booking id. */
  findByRequestIds(requestIds: string[]): Promise<Booking[]>;
}

export type ClaimResult =
  | { kind: 'created'; request: GoalkeeperRequest; bookings: Booking[] }
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
    build: (quote: Quote) => { request: GoalkeeperRequest; bookings: Booking[] },
  ): Promise<ClaimResult>;
}

export type BookingConfirmationOutcome =
  | 'created'
  | 'replayed'
  | 'quote_not_found'
  | 'quote_expired'
  | 'duplicate_request'
  | 'confirmation_in_progress';

/** Audit trail of every confirmation attempt (FR-024). */
export interface IBookingAuditLogger {
  logBookingConfirmation(entry: {
    outcome: BookingConfirmationOutcome;
    clientId: string;
    quoteId: string;
    requestId?: string;
    bookingIds?: string[];
  }): void;
}
