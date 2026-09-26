import type { LeadTimeSurcharge } from '../../src/domain/pricing/bookingSettings.js';
import { Booking } from '../../src/domain/bookings/booking.js';
import { MatchDetails } from '../../src/domain/bookings/matchDetails.js';
import { PricingSnapshot } from '../../src/domain/bookings/pricingSnapshot.js';
import { Quote } from '../../src/domain/bookings/quote.js';
import { BookingSettings } from '../../src/domain/pricing/bookingSettings.js';
import { RentalRate } from '../../src/domain/pricing/rentalRate.js';
import { Country } from '../../src/domain/countries/country.js';
import { City } from '../../src/domain/locations/city.js';
import { Region } from '../../src/domain/locations/region.js';
import { Zone } from '../../src/domain/zones/zone.js';
import type { FakeBookingSettingsRepository } from '../fakes/fakeBookingSettingsRepository.js';
import type { FakeCityRepository } from '../fakes/fakeCityRepository.js';
import type { FakeCountryRepository } from '../fakes/fakeCountryRepository.js';
import type { FakeRegionRepository } from '../fakes/fakeRegionRepository.js';
import type { FakeRentalRateRepository } from '../fakes/fakeRentalRateRepository.js';
import type { FakeZoneRepository } from '../fakes/fakeZoneRepository.js';

/**
 * A small "world" for quote tests, shared by the handler unit tests and the HTTP tests.
 * It uses its OWN cities (Cali, Mexico City, New York, Delhi) so it never disturbs the
 * cities/zones the older HTTP suites assert on.
 *
 * Clock reference: 2026-09-21T18:00:00Z is 13:00 in Bogotá (UTC−5, no DST).
 */
export const QUOTE_NOW = '2026-09-21T18:00:00.000Z';

/** Coordinates that fall inside exactly one fixture zone each. */
export const POINTS = {
  caliNorte: { latitude: 3.45, longitude: -76.5 }, // zone with its own rates for 60/90/120
  caliSur: { latitude: 3.35, longitude: -76.5 }, // zone with its own rate for 60 only
  caliCentro: { latitude: 3.25, longitude: -76.5 }, // zone with no rates of its own
  cdmx: { latitude: 19.4, longitude: -99.1 },
  nyc: { latitude: 40.75, longitude: -73.98 },
  delhi: { latitude: 28.6, longitude: 77.2 },
  nowhere: { latitude: 0, longitude: 0 },
};

export const COLOMBIA_SURCHARGE: LeadTimeSurcharge = tiers(10000, 5000);

/** Surcharge tiers in whole units of whatever currency the country uses (the currency lives on the country). */
function tiers(under60: number, under120: number): LeadTimeSurcharge {
  return {
    tiers: [
      { fromMinutes: 0, toMinutes: 60, amount: under60 },
      { fromMinutes: 60, toMinutes: 120, amount: under120 },
      { fromMinutes: 120, toMinutes: null, amount: 0 },
    ],
  };
}

function rectangle(latMin: number, latMax: number, lngMin: number, lngMax: number) {
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [lngMin, latMin],
        [lngMax, latMin],
        [lngMax, latMax],
        [lngMin, latMax],
        [lngMin, latMin],
      ],
    ],
  };
}

export interface QuoteWorldRepositories {
  /** A dedicated instance for quotes: seeding it into the shared one would change the countries the profile/locations suites assert on. */
  countryRepository: FakeCountryRepository;
  zoneRepository: FakeZoneRepository;
  cityRepository: FakeCityRepository;
  regionRepository: FakeRegionRepository;
  rentalRateRepository: FakeRentalRateRepository;
  bookingSettingsRepository: FakeBookingSettingsRepository;
}

let rateSequence = 0;
function seedRates(
  repo: FakeRentalRateRepository,
  scope: 'zone' | 'city',
  refId: string,
  amounts: Partial<Record<60 | 90 | 120, number>>,
): void {
  for (const [duration, amount] of Object.entries(amounts)) {
    rateSequence += 1;
    repo.seed(
      new RentalRate({ id: `rate-${rateSequence}`, scope, refId, durationMinutes: Number(duration), amount: amount! }),
    );
  }
}

export function seedQuoteWorld(repos: QuoteWorldRepositories): void {
  const { countryRepository, zoneRepository, cityRepository, regionRepository, rentalRateRepository, bookingSettingsRepository } = repos;

  // ---- Countries: each carries the currency of every price in it
  countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  countryRepository.seed(new Country({ id: 'country-mx', name: 'México', dialCode: '+52', countryCode: 'MX', currency: 'MXN' }));
  countryRepository.seed(new Country({ id: 'country-us', name: 'United States', dialCode: '+1', countryCode: 'US', currency: 'USD' }));
  countryRepository.seed(new Country({ id: 'country-in', name: 'India', dialCode: '+91', countryCode: 'IN', currency: 'INR' }));

  // ---- Colombia (Cali): three zones exercising own-rate / partial-rate / pure-fallback
  regionRepository.seed(new Region({ id: 'region-valle', name: 'Valle del Cauca', countryId: 'country-co' }));
  cityRepository.seed(
    new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'America/Bogota' }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-cali-norte', cityId: 'city-cali', name: 'Norte', slug: 'cali-co-norte', geometry: rectangle(3.4, 3.5, -76.55, -76.45), active: true, displayOrder: 1 }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-cali-sur', cityId: 'city-cali', name: 'Sur', slug: 'cali-co-sur', geometry: rectangle(3.3, 3.39, -76.55, -76.45), active: true, displayOrder: 2 }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-cali-centro', cityId: 'city-cali', name: 'Centro', slug: 'cali-co-centro', geometry: rectangle(3.2, 3.29, -76.55, -76.45), active: true, displayOrder: 3 }),
  );
  seedRates(rentalRateRepository, 'zone', 'zone-cali-norte', { 60: 40000, 90: 55000, 120: 70000 });
  seedRates(rentalRateRepository, 'zone', 'zone-cali-sur', { 60: 45000 });
  seedRates(rentalRateRepository, 'city', 'city-cali', { 60: 41000, 90: 56000, 120: 71000 });
  bookingSettingsRepository.seed(
    new BookingSettings({ id: 'settings-co', scope: 'country', refId: 'country-co', bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: COLOMBIA_SURCHARGE }),
  );

  // ---- Mexico: another country, time zone and currency (MXN, from the country)
  regionRepository.seed(new Region({ id: 'region-cdmx', name: 'Ciudad de México', countryId: 'country-mx' }));
  cityRepository.seed(
    new City({ id: 'city-cdmx', name: 'Ciudad de México', regionId: 'region-cdmx', zoneCityId: null, timeZone: 'America/Mexico_City' }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-cdmx', cityId: 'city-cdmx', name: 'Centro', slug: 'cdmx-mx-centro', geometry: rectangle(19.3, 19.5, -99.2, -99.0), active: true, displayOrder: 1 }),
  );
  seedRates(rentalRateRepository, 'zone', 'zone-cdmx', { 60: 800, 90: 1100, 120: 1400 });
  bookingSettingsRepository.seed(
    new BookingSettings({ id: 'settings-mx', scope: 'country', refId: 'country-mx', bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: tiers(200, 100) }),
  );

  // ---- United States: observes daylight-saving time (UTC−4 in September)
  regionRepository.seed(new Region({ id: 'region-ny', name: 'New York', countryId: 'country-us' }));
  cityRepository.seed(
    new City({ id: 'city-nyc', name: 'New York', regionId: 'region-ny', zoneCityId: null, timeZone: 'America/New_York' }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-nyc', cityId: 'city-nyc', name: 'Manhattan', slug: 'nyc-us-manhattan', geometry: rectangle(40.6, 40.9, -74.1, -73.9), active: true, displayOrder: 1 }),
  );
  seedRates(rentalRateRepository, 'zone', 'zone-nyc', { 60: 40, 90: 55, 120: 70 });
  bookingSettingsRepository.seed(
    new BookingSettings({ id: 'settings-us', scope: 'country', refId: 'country-us', bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: tiers(10, 5) }),
  );

  // ---- India: a half-hour UTC offset (+05:30), so "30-minute marks" must be judged locally
  regionRepository.seed(new Region({ id: 'region-delhi', name: 'Delhi', countryId: 'country-in' }));
  cityRepository.seed(
    new City({ id: 'city-delhi', name: 'New Delhi', regionId: 'region-delhi', zoneCityId: null, timeZone: 'Asia/Kolkata' }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-delhi', cityId: 'city-delhi', name: 'Central', slug: 'delhi-in-central', geometry: rectangle(28.5, 28.7, 77.1, 77.3), active: true, displayOrder: 1 }),
  );
  seedRates(rentalRateRepository, 'zone', 'zone-delhi', { 60: 500, 90: 700, 120: 900 });
  bookingSettingsRepository.seed(
    new BookingSettings({ id: 'settings-in', scope: 'country', refId: 'country-in', bookingWindowDays: 2, minNoticeMinutes: 30, leadTimeSurcharge: tiers(100, 50) }),
  );
}

/** A well-formed quote id (UUIDv7) — the confirmation refuses anything that is not a UUID. */
export const STORED_QUOTE_ID = '01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00';

/**
 * The canonical stored quote: Cali Norte, 2 goalkeepers × 90 minutes at 15:00 Bogotá,
 * issued at `QUOTE_NOW` with 90 minutes of notice → (55.000 + 5.000) × 2 = 120.000 COP.
 */
export function buildStoredQuote(
  overrides: Partial<{ id: string; clientId: string; issuedAt: string; zoneId: string; startsAt: string; validityMinutes: number }> = {},
): Quote {
  const startsAt = overrides.startsAt ?? '2026-09-21T20:00:00.000Z';
  const match = new MatchDetails({
    ...POINTS.caliNorte,
    zoneId: overrides.zoneId ?? 'zone-cali-norte',
    cityId: 'city-cali',
    startsAt: new Date(startsAt),
    startsAtLocal: '2026-09-21T15:00:00-05:00',
    timeZone: 'America/Bogota',
    goalkeeperCount: 2,
    durationMinutes: 90,
  });
  const pricing = new PricingSnapshot(
    { unitRate: 55000, subtotal: 110000, unitSurcharge: 5000, surcharge: 10000, total: 120000, currency: 'COP' },
    2,
  );
  return Quote.issue(
    overrides.id ?? STORED_QUOTE_ID,
    overrides.clientId ?? 'client-a',
    match,
    pricing,
    new Date(overrides.issuedAt ?? QUOTE_NOW),
    overrides.validityMinutes ?? 3,
  );
}

/**
 * A stored booking of the Cali Norte world (120.000 COP, 2 goalkeepers, 90 min) with only the
 * fields a list cares about varied: who owns it, when it starts and where.
 */
export function buildBooking(
  id: string,
  startsAt: Date,
  overrides: Partial<{ clientId: string; zoneId: string; cityId: string }> = {},
): Booking {
  return Booking.rehydrate({
    id,
    clientId: overrides.clientId ?? 'client-a',
    quoteId: `quote-${id}`,
    status: 'pending_assignment',
    match: new MatchDetails({
      ...POINTS.caliNorte,
      zoneId: overrides.zoneId ?? 'zone-cali-norte',
      cityId: overrides.cityId ?? 'city-cali',
      startsAt,
      startsAtLocal: '2026-09-25T13:00:00-05:00',
      timeZone: 'America/Bogota',
      goalkeeperCount: 2,
      durationMinutes: 90,
    }),
    pricing: new PricingSnapshot(
      { unitRate: 55000, subtotal: 110000, unitSurcharge: 5000, surcharge: 10000, total: 120000, currency: 'COP' },
      2,
    ),
    quoteIssuedAt: new Date('2026-09-20T12:00:00.000Z'),
    createdAt: new Date('2026-09-20T12:01:00.000Z'),
  });
}
