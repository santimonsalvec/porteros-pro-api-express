import type { Booking } from '../../../../domain/bookings/booking.js';
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

export interface IBookingRepository {
  /** The booking created from this quote, when it belongs to this client (replays are matched on it). */
  findByQuoteForClient(quoteId: string, clientId: string): Promise<Booking | null>;
  /** The client's booking for that zone and start instant, if any (at most one exists). */
  findByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<Booking | null>;
}

export type ClaimResult =
  | { kind: 'booked'; booking: Booking }
  /** No pending, unexpired quote with that id belongs to this client. Nothing was written. */
  | { kind: 'not_claimed' }
  /** A booking for this quote already exists (a concurrent confirmation won). Nothing was written. */
  | { kind: 'already_booked' }
  /** The client already holds a booking for this zone and start. Nothing was written; the quote stays. */
  | { kind: 'duplicate_booking'; zoneId: string; startsAt: Date };

/**
 * The one step that must be atomic: delete the client's claimable quote and insert the booking
 * built from it — both or neither (FR-010, FR-011).
 */
export interface IQuoteConfirmationStore {
  claimAndBook(quoteId: string, clientId: string, now: Date, newBooking: (quote: Quote) => Booking): Promise<ClaimResult>;
}

export type BookingConfirmationOutcome =
  | 'created'
  | 'replayed'
  | 'quote_not_found'
  | 'quote_expired'
  | 'duplicate_booking'
  | 'confirmation_in_progress';

/** Audit trail of every confirmation attempt (FR-024). */
export interface IBookingAuditLogger {
  logBookingConfirmation(entry: {
    outcome: BookingConfirmationOutcome;
    clientId: string;
    quoteId: string;
    bookingId?: string;
  }): void;
}
