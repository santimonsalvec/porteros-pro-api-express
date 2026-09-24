# Phase 1 Data Model: Goalkeeper Service Quote

The quote itself is **transient** (never persisted, FR-020). The entities below are read-only inputs: two new collections owned/seeded by the database owner, plus new fields on two pre-existing externally-owned collections.

## `RentalRate` (`src/domain/pricing/rentalRate.ts`, MongoDB collection `rentalRates` — **new**, seeded by the data owner, read-only from this system)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `_id` in Mongo |
| `scope` | `'zone' \| 'city'` | Which kind of place `refId` refers to |
| `refId` | `string` | A `Zone` id when `scope='zone'`; an **anchor** `City` id when `scope='city'` |
| `durationMinutes` | `60 \| 90 \| 120` | One document per duration |
| `amount` | `number` (integer > 0) | Price **per goalkeeper**, whole units of the country's currency (`40000` = 40.000 COP). No currency field: it is the country's |

**Uniqueness**: `(scope, refId, durationMinutes)` — one price per place per duration.
**Validation on read**: non-integer or `amount ≤ 0`, unknown `scope`, or `durationMinutes` ∉ {60, 90, 120} ⇒ configuration error (never treated as free, never skipped).
**Selection rule**: zone rate for the identified zone wins; otherwise the city rate for `zone.cityId`; otherwise `rate_not_configured` — evaluated per duration.

## `BookingSettings` (`src/domain/pricing/bookingSettings.ts`, MongoDB collection `bookingSettings` — **new**, seeded by the data owner, read-only from this system)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `_id` in Mongo |
| `scope` | `'country' \| 'city'` | Level at which these values are defined |
| `refId` | `string` | A `Country` id or an **anchor** `City` id |
| `bookingWindowDays` | `number \| null` | Integer ≥ 1. `N` = today plus the next `N−1` local calendar days. Absent ⇒ inherit |
| `minNoticeMinutes` | `number \| null` | Integer ≥ 0. Absent ⇒ inherit |
| `leadTimeSurcharge` | `{ tiers: SurchargeTier[] } \| null` | Absent ⇒ inherit. No currency field: amounts are in the country's currency (a leftover `currency` key in the stored document is ignored) |

`SurchargeTier`: `{ fromMinutes: number; toMinutes: number \| null; amount: number }` — `fromMinutes` inclusive, `toMinutes` exclusive, `null` = unbounded; `amount` is an integer ≥ 0 in whole units of the country's currency.

**Uniqueness**: `(scope, refId)`.
**Tier validation on read**: tiers sorted by `fromMinutes`, non-overlapping; `fromMinutes ≥ 0`; `toMinutes > fromMinutes` when set; only the last tier may be unbounded. Gaps are allowed (⇒ surcharge 0). Any violation ⇒ configuration error.
**No built-in defaults exist**; every field that resolves to "absent at both levels" is reported by name in `service_not_configured.missing`.

### Resolution (`resolveBookingSettings`, pure)

For the city that owns the zone (`cityId`) and its `countryId`:

```
bookingWindowDays  = city.doc.bookingWindowDays  ?? country.doc.bookingWindowDays  ?? MISSING
minNoticeMinutes   = city.doc.minNoticeMinutes   ?? country.doc.minNoticeMinutes   ?? MISSING
leadTimeSurcharge  = city.doc.leadTimeSurcharge  ?? country.doc.leadTimeSurcharge  ?? MISSING
```

Each field resolves **independently** (a city overriding only tiers still inherits the country's window and notice). If `countryId` is unknown, only city-level values can satisfy a field.

## `City` (`src/domain/locations/city.ts`, collection `cities` — pre-existing, externally owned) — **field added**

| Field | Type | Notes |
|---|---|---|
| `timeZone` | `string \| null` | **New.** IANA identifier (`America/Bogota`). Absent ⇒ that city cannot be quoted (`time_zone_not_configured`). Checked with `Intl` by the quote handler (an invalid identifier ⇒ configuration error), not by the repository |

Existing fields (`name`, `regionId`, `zoneCityId`) are unchanged. The constructor takes `timeZone` as **optional** (default `null`), so no existing call site or test changes. A city carries **no** `countryId` of its own: its country is found through its region.

## `Region` (`src/domain/locations/region.ts`, collection `regions` — pre-existing, externally owned) — **field added**

| Field | Type | Notes |
|---|---|---|
| `countryId` | `string \| null` | **New.** The `countries._id` this region belongs to. `null` when the region has none recorded |

Country resolution (confirmed by the data owner): `city.regionId → region.countryId → country._id`, i.e. `region(city.regionId).countryId ?? null`. One region read per quote. A region with no `countryId` leaves the country unknown, so only city-level settings can apply.

## `Zone` (pre-existing, unchanged shape)

Only new **behavior**: `IZoneRepository.findActiveContainingPoint(latitude, longitude)` returns the active zone whose polygon contains the point, ties broken by `displayOrder` ascending then `id` ascending (research.md §2). `Zone.cityId` is the anchor city — the city used for the time zone, rates fallback, and settings.

## `Country` (`src/domain/countries/country.ts`, collection `countries` — pre-existing, externally owned) — **field added**

| Field | Type | Notes |
|---|---|---|
| `currency` | `string \| null` | **New.** ISO 4217 code (`COP`) in which every price in the country is expressed. `null` ⇒ that country cannot be quoted (`service_not_configured`, `missing: ['currency']`). Checked by the quote handler (3 uppercase letters, else configuration error), not by `CountryRepository` |

Existing fields (`name`, `countryCode`, `dialCode`) are unchanged; the constructor takes `currency` as **optional** (default `null`). The country is also the `refId` of `scope: 'country'` settings, and the source of the quote's `currency`.

## Transient types (application layer, not persisted)

```ts
// Parsed client input — produced by the controller's zod schema
interface ServiceQuoteInput {
  latitude: number;
  longitude: number;
  startsAt: ParsedStartsAt;          // { local: {y,mo,d,h,mi,s,ms}, offsetMinutes: number | null }
  goalkeeperCount: 1 | 2;
  durationMinutes: 60 | 90 | 120;
}

interface ServiceQuote {
  unitRate: number;
  goalkeeperCount: 1 | 2;
  subtotal: number;                  // unitRate × goalkeeperCount
  surcharge: number;                 // from the applicable lead-time tier, else 0
  total: number;                     // subtotal + surcharge
  currency: string;                  // the country's currency
  startsAt: string;                  // resolved instant, UTC ISO-8601 ('…Z')
  startsAtLocal: string;             // same instant in the city's zone, '…±HH:mm'
  timeZone: string;                  // city's IANA id
}

type GetServiceQuoteResult =
  | { outcome: 'success'; quote: ServiceQuote }
  | { outcome: 'location_not_covered' }
  | { outcome: 'time_zone_not_configured'; cityId: string }
  | { outcome: 'invalid_start_time'; reason: 'not_on_slot' | 'nonexistent_local_time' | 'ambiguous_local_time' }
  | { outcome: 'start_time_in_past' }
  | { outcome: 'service_not_configured'; cityId: string; missing: MissingSetting[] }
  | { outcome: 'insufficient_notice'; minNoticeMinutes: number }
  | { outcome: 'outside_booking_window'; bookingWindowDays: number }
  | { outcome: 'rate_not_configured'; zoneId: string; cityId: string; durationMinutes: number };

type MissingSetting = 'bookingWindowDays' | 'minNoticeMinutes' | 'leadTimeSurcharge' | 'currency';
```

## Ports (application layer)

```ts
// application/features/zones/common/ports.ts  — extended
interface IZoneRepository {
  /* existing members unchanged */
  findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null>;
}

// application/features/goalkeeperRequests/common/ports.ts — new
interface IRentalRateRepository {
  /** At most one zone-scope and one city-scope rate for that duration. */
  findForDuration(zoneId: string, cityId: string, durationMinutes: number): Promise<{ zone: RentalRate | null; city: RentalRate | null }>;
}
interface IBookingSettingsRepository {
  /** The city-scope and country-scope documents (either may be null; `countryId` may be null). */
  findFor(cityId: string, countryId: string | null): Promise<{ city: BookingSettings | null; country: BookingSettings | null }>;
}

// application/common/clock.ts — new
interface IClock { now(): Date }
```

`ICityRepository.getById` and `IRegionRepository.getByIds` (existing) supply the city and region; no change to their signatures. The country comes from a new narrow read-only port, `ICountryLookup { getById(id): Promise<Country | null> }` (in `goalkeeperRequests/common/ports.ts`), which the existing `CountryRepository` satisfies.

## Suggested indexes

| Collection | Index | Created by |
|---|---|---|
| `rentalRates` | unique `(scope, refId, durationMinutes)` | `RentalRateRepository.ensureIndexes()` (collection is new; mirrors the goalkeeper repositories) |
| `bookingSettings` | unique `(scope, refId)` | `BookingSettingsRepository.ensureIndexes()` |
| `zones` | `2dsphere` on `geometry` | **Data owner, optional** (quickstart §5) — deliberately *not* created by the app (research.md §2) |

## State transitions

None. This feature holds no state and creates no documents.
