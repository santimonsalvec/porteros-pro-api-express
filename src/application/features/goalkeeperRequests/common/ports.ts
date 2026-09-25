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
