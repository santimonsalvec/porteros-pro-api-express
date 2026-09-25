# Phase 0 Research: Goalkeeper Service Quote

All Technical Context items resolved; no `NEEDS CLARIFICATION` remains. Two **data facts** could not be verified from code (they live in externally-owned collections) and are recorded as prerequisites in §8 and in quickstart.md rather than as open design questions — the design tolerates both possible answers.

## 1. Endpoint shape: `POST /api/goalkeeper-requests/quote`, English camelCase field names

**Decision**: One authenticated route, `POST /api/goalkeeper-requests/quote`, JSON body `{ latitude, longitude, startsAt, goalkeeperCount, durationMinutes }`. It is a mediator **query** (no side effects, FR-020) exposed over `POST`.

| Source description | API field |
|---|---|
| `latitud` | `latitude` |
| `longitud` | `longitude` |
| `fecha_hora` | `startsAt` |
| `cantidad_porteros` | `goalkeeperCount` |
| `duracion_minutos` | `durationMinutes` |

**Rationale**:
- **POST, not GET**: `startsAt` may carry a `+05:30` offset; in a query string an unencoded `+` becomes a space and silently corrupts the value, a classic client bug. A JSON body has no such failure mode. The draft in `specs/006-find-goalkeeper/IMPLEMENTATION_PLAN.md` also uses `POST …/quote`.
- **Path** follows that same 006 draft (`/api/goalkeeper-requests/…`) so the later request/booking endpoints slot into the same resource; only `/quote` is created now.
- **English camelCase**: every existing endpoint (`cityId`, `zoneIds`, `radiusKm`, …) uses it; the Spanish snake_case names in the source description are documentation language. Renaming to match the description literally is a one-file change (`getServiceQuoteRequest.ts`) if preferred.

**Alternatives rejected**: `GET` with query params (the `+` pitfall above; also invites caching of a `now`-dependent answer). `/api/quotes` (orphaned from the booking flow that consumes it).

## 2. Point → zone lookup: `$geoIntersects`, deterministic tie-break, no app-created index

**Decision**: `IZoneRepository.findActiveContainingPoint(latitude, longitude): Promise<Zone | null>` runs

```js
find({ active: true, geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [longitude, latitude] } } } })
  .sort({ displayOrder: 1, _id: 1 }).limit(1)
```

Note GeoJSON order is **`[longitude, latitude]`**.

**Rationale**:
- Zones are stored as GeoJSON `Polygon`/`MultiPolygon` (existing `Zone.geometry`), so MongoDB can answer containment natively; no geometry library is introduced (matches `005`'s stance).
- `$geoIntersects` does **not** require a geospatial index (unlike `$near`), so it works today against the unindexed collection; the zone set is small (tens per city), so a scan is cheap for now. A `2dsphere` index on `zones.geometry` is recommended to the data owner (quickstart §5) but this app does **not** create it: `ensureIndexes()` runs at startup (`di.ts`), and building a `2dsphere` index **fails if any stored polygon is invalid**, which would take the whole API down for a data problem in an externally-owned collection.
- Tie-break for overlapping zones (FR-011): `displayOrder` ascending, then `_id` ascending — total order, so identical coordinates always resolve identically. A point exactly on a boundary counts as inside (MongoDB semantics), which the same tie-break resolves.
- **Risk (corrected 2026-09-21, found on real data)**: an *invalid* polygon does **not** make the query error out — an unindexed `$geoIntersects` silently treats a stored document whose geometry fails validation as *not matching*. That zone becomes **unreachable**: every point inside it answers `location_not_covered` (or is assigned to a neighbouring zone), with no error anywhere. The development database had exactly this case ("Suroccidental": a `MultiPolygon` whose second polygon had two crossing edges, so the whole zone was ignored). Consequently the old check "run a `$geoIntersects` scan and expect no error" cannot detect it. The reliable check is to use each zone's geometry as the *query* geometry, which MongoDB validates strictly and rejects with the reason (quickstart §6). Winding order is irrelevant here: all 13 zones are clockwise and 12 work.

**Alternatives rejected**: loading all active zones and testing point-in-polygon in app code (needs a geometry routine or library, moves scale into Node memory, duplicates what MongoDB does); creating the `2dsphere` index from `ensureIndexes()` (startup fragility above).

## 3. Time-zone arithmetic: built-in `Intl`, no new dependency

**Decision**: Implement a small pure module (`zonedTime.ts`) on top of `Intl.DateTimeFormat(…, { timeZone })`:
- `isValidTimeZone(id)` — `Intl.DateTimeFormat` throws `RangeError` for an unknown identifier.
- `zoneOffsetMinutes(timeZone, epochMs)` — format the instant into calendar parts in that zone, rebuild them with `Date.UTC`, and subtract: the difference is the offset.
- `resolveLocalDateTime(local, timeZone)` → `ok(instant) | nonexistent | ambiguous`: compute the offset one day before and one day after the local wall time, derive the candidate instant for each, keep the candidates whose own offset matches. **0 candidates ⇒ the local time was skipped (DST gap); 2 ⇒ it happened twice (DST overlap); 1 ⇒ unambiguous.** This is exactly FR-023.
- `toLocalParts(epochMs, timeZone)` — used for the 30-minute-mark check, the local calendar day, and the `startsAtLocal` in the response.

**Verified** in a scratch prototype against the runtime's tz data: `America/Bogota` −300; `Asia/Kolkata` +330 and `Asia/Kathmandu` +345 (so a "30-minute mark" must be judged **locally**, not on the UTC minute — FR-005/FR-022); `America/New_York` 2026-03-08 02:30 → nonexistent, 2026-11-01 01:30 → ambiguous, 03:00 → ok; `Australia/Lord_Howe` (a 30-minute DST shift) 02:15 on 2026-10-04 → nonexistent.

**Rationale**: the only genuinely hard part — "what is this zone's offset at this instant" — is answered authoritatively by the runtime's tz database; the remaining logic is ~40 lines of pure, exhaustively unit-testable code. Node 24 ships full ICU. Keeps `001`–`005`'s "no new dependency" record.

**Alternatives rejected**: `luxon` (the 006 draft's tentative P11 choice) — a dependency to wrap one offset lookup, and it *silently shifts* nonexistent local times forward, so gap/overlap detection would need the same custom probing anyway. `Temporal` — not available unflagged in the target runtime and absent from the ES2022 `lib` this repo compiles against.

## 4. `startsAt` parsing, and the controller / application validation split

**Decision**: A single pure parser (`parseStartsAt`) accepts `YYYY-MM-DDTHH:mm[:ss[.fraction]][Z|±HH:mm]` and returns `{ local: {year,month,day,hour,minute,second,millisecond}, offsetMinutes: number | null }` (`Z` ⇒ 0, absent ⇒ `null`), rejecting impossible calendar dates (Feb 30), hour > 23, second > 59. It never uses `Date.parse` (which reads offset-less strings in the *server's* time zone — the exact bug FR-022 forbids).

Split, following the project's stated rule ("initial validations in the controller, business rules in the application layer"):

| Where | Checks | Failure |
|---|---|---|
| Controller (zod) | field present and of the right type; latitude −90..90, longitude −180..180; `goalkeeperCount` ∈ {1,2}; `durationMinutes` ∈ {60,90,120}; `startsAt` parses | `400 validation_failed` + `fieldErrors` (FR-002) |
| Application | 30-minute mark **in the city's local time**, DST gap/overlap, past, minimum notice, window, coverage, rates, configuration | distinct `outcome` per rule (FR-009) |

The source description lists the 30-minute interval under controller checks; that check is deliberately in the application layer because after clarification it depends on the city's time zone, which is only known once the location is resolved (spec FR-005).

`fieldErrors` need a small local helper (`zodFieldErrors`) because the global `errorHandler` collapses a `ZodError` to a generic body with no field names; changing the global handler would alter every existing endpoint's response, so the new controller catches its own parse failure and throws `ApiError(400, 'validation_failed', …, fieldErrors)`.

## 5. Injectable clock

**Decision**: New port `IClock { now(): Date }` in `application/common/clock.ts`; `SystemClock` in infrastructure; `FixedClock` fake in tests with `set()`/`advance()`.

**Rationale**: "now" drives past/notice/window/surcharge; boundary tests (SC-002, 29:59 vs 30:00) are impossible against the real clock. Existing code calls `new Date()` inline, but none of it needs boundary-exact tests. The mediator handler receives the clock through its constructor like any other dependency.

## 6. Booking settings storage: one document per scope, each setting resolved independently

**Decision**: New collection `bookingSettings`, one document per `(scope, refId)` where `scope ∈ {'country','city'}`. Every setting field is **optional** on the document:

```
{ _id, scope, refId, bookingWindowDays?, minNoticeMinutes?, leadTimeSurcharge?: { tiers: [{fromMinutes, toMinutes|null, amount}] } }
```

Resolution (FR-025), per field: the city document's value if present, else the country document's, else **missing**. If any of the three fields is missing, the quote is refused `422 service_not_configured` with `missing: [...]` naming exactly the absent settings. No built-in defaults exist anywhere in code.

One query fetches both documents: `find({ $or: [{ scope:'city', refId: cityId }, { scope:'country', refId: countryId }] })`.

**Validation on read**: a malformed document (window not an integer ≥ 1, negative minutes, non-contiguous/overlapping tiers) throws a configuration error → generic 500 with the detail logged. *Loud* rather than falling back to the parent level, because silently inheriting the wrong value would mis-price or mis-refuse quotes without anyone noticing.

**No cache**: a quote costs a handful of small indexed reads (§13); reading fresh every time makes SC-005 ("within 1 minute") trivially true and removes a stale-config failure mode. A short TTL cache can be added later behind the same port with no contract change.

**Alternatives rejected**: three separate collections (three round-trips and three places to seed for one policy); a single global document (contradicts clarification Q3); env vars (require a redeploy — spec Story 4).

## 7. Rates storage

**Decision**: New collection `rentalRates`, one document per `(scope, refId, durationMinutes)`:

```
{ _id, scope: 'zone' | 'city', refId, durationMinutes: 60|90|120, amount: integer > 0 }   // no currency: it is the country's
```

For a quote: one query `find({ durationMinutes, $or: [{ scope:'zone', refId: zoneId }, { scope:'city', refId: zone.cityId }] })` returns at most two documents; the zone one wins, else the city one, else `rate_not_configured` (FR-012, FR-014). The fallback is therefore per duration by construction (Story 2, scenario 3). `zone.cityId` is always the **anchor** city (existing `Zone` contract), which is the city "that owns the zone" throughout this feature (rates, time zone, settings).

Unique index `(scope, refId, durationMinutes)`; `amount ≤ 0` or non-integer on read ⇒ configuration error (never "free").

## 8. Country resolution and the two data prerequisites

**Decision**: The country of the zone's city is found through its region: `city.regionId → region.countryId → country._id`, i.e. `region(city.regionId).countryId ?? null`. `Region` gains a nullable `countryId`; `City` gains a nullable `timeZone`. If the region has no country recorded, the country is unknown and only a city-level settings document can make the area quotable (spec edge case "city whose country cannot be determined").

**Confirmed by the data owner (2026-09-20)**: a `region` document is `{ _id, name, countryId }`, a `city` is `{ _id, name, regionId, timeZone, zoneCityId }` and a `country` is `{ _id, name, countryCode, dialCode }`. Cities carry **no** `countryId` of their own. The `bookingSettings.refId` of a country-level document is therefore the `countries._id` — the same string stored in `regions.countryId`. (An earlier draft of this design also read a `countryId` from the city itself, in case the link lived there; once the data owner confirmed it does not, that path was removed.)

**Data prerequisites (quickstart §1–§4)**:
1. ~~Confirm where the country link lives~~ — **done**: `regions.countryId`.
2. ~~Ensure `timeZone` (IANA id, e.g. `America/Bogota`) on every **anchor** city that owns zones~~ — **done**: the data owner confirmed every city has it (verify the values are valid identifiers). A city without one refuses quotes (`time_zone_not_configured`, FR-023). The identifier is checked with `isValidTimeZone` **by the quote handler** (not in `CityRepository`, so one bad value can't break the unrelated city-search and zone-preview endpoints); an invalid identifier is a configuration error (500 + log), not a silent skip.
3. Seed `bookingSettings` and `rentalRates` for Colombia before launch — there are no defaults to fall back on.

## 9. Surcharge tier semantics

**Decision**: A tier is `{ fromMinutes, toMinutes, amount }` with `fromMinutes` **inclusive**, `toMinutes` **exclusive**, `toMinutes: null` meaning unbounded. Lead time is real elapsed minutes as a fractional number (`(start − now) / 60 000`), so 59 min 59 s is `< 60` (spec edge case). The Colombian configuration is `[0,60)→10.000`, `[60,120)→5.000`, `[120,∞)→0`. Tiers must not overlap; gaps are legal and yield surcharge `0` (FR-017). `fromMinutes` of the lowest tier may be `0` (negative lead time never reaches this step — it was refused as past).

## 10. Money representation and where the currency lives

**Decision — amounts**: Integers in **whole currency units** (`40000` = 40.000 COP), matching the spec's assumption ("whole units"). All arithmetic is integer, so no floating-point rounding exists.

**Decision — currency** (data owner, 2026-09-21): the currency is a property of the **country** (`countries.currency`, a 3-letter uppercase code such as `COP`), not of each rate or surcharge tier. A country has exactly one currency, so storing it per row only invites a rate and a tier that disagree. The quote reads it through the same chain as the settings: `zone → city → region → country`. `Country` gains a nullable `currency`; `RentalRate` and `LeadTimeSurcharge` lose theirs (a leftover `currency` key inside an already-loaded `leadTimeSurcharge` is simply ignored on read). A country with no currency — or a city whose region has no country — cannot be quoted: `422 service_not_configured` with `missing` including `'currency'`, listed after the other missing settings. A currency that is present but not a 3-letter uppercase code is broken configuration (500 + log). That validation happens in the quote handler, **not** in `CountryRepository`, for the same reason as the time zone: the repository also serves the profile and country endpoints, which one bad value must not break. The currency-mismatch refusal that the per-row design needed no longer exists.

**Deferred**: currencies with minor units (USD cents) would need an explicit `minorUnits` on the country (or per-currency), so amounts could be stored as integers of the smallest unit; adding it later is backward compatible (absent ⇒ 0). Not introduced now because no such market is planned in this feature's scope.

## 11. Refusal taxonomy, evaluation order, HTTP mapping

Handler evaluation order (first failing rule wins; the order is fixed so single-defect tests in Story 3 are unambiguous):

1. *(controller)* shape/ranges → `400 validation_failed`
2. Point → active zone, else `400 location_not_covered`
3. City of the zone → `timeZone`, else `422 time_zone_not_configured`
4. Resolve `startsAt` in that zone: DST gap/overlap or not on a local :00/:30 with zero seconds → `400 invalid_start_time` (`reason`: `not_on_slot` | `nonexistent_local_time` | `ambiguous_local_time`)
5. Start before now → `400 start_time_in_past`
6. Resolve settings and the country's currency → any missing → `422 service_not_configured`
7. Lead time < minimum notice → `400 insufficient_notice`
8. Local day beyond window → `400 outside_booking_window`
9. Rate for duration (zone → city) → else `422 rate_not_configured`
10. Lead-time surcharge tier → surcharge amount (in the country's currency)

**Status split**: `400` = the caller can fix the request (different time, count, location); `422` = the request is well-formed but the service is not set up for that area/duration (data gap only the business can close). All bodies use the existing `ApiError` shape `{ error, message, …extra }`.

**Rationale for step 5 before 6**: "in the past" needs no configuration, so it is reported even in an unconfigured area.

## 12. Authentication

`requireAuth` + `requireClientOnly` + `requireCompleteProfile`, applied to the router exactly as `goalkeeperController` does for `/me/*` and as the 006 draft states (FR-021: authenticated clients only). Goalkeepers hold client accounts too, so they can quote; no new role rule is introduced.

## 13. Performance and hosting

`apphosting.yaml`: `minInstances: 0`, `maxInstances: 1`, `concurrency: 80`. The handler is stateless and timer-free, so cold starts and throttling are harmless. Read cost per quote: zone lookup (1), city (1), region (1), then rates (1), settings (1) and country (1) **in parallel** — 5–6 small reads, comfortably inside SC-003's 2 s at p95. No new index is required for rates/settings beyond their unique keys.

## 14. Out of scope (kept out on purpose)

Creating requests/bookings, notifying goalkeepers, price snapshots or "price changed" checks, payments, an admin UI for rates/settings, currencies with minor units, a settings cache, geometry validation, city/country management. All are either later features (006 flow) or explicitly excluded by spec Assumptions.
