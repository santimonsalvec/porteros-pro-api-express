---

description: "Task list for Goalkeeper Service Quote"
---

# Tasks: Goalkeeper Service Quote

**Input**: Design documents from `/specs/007-goalkeeper-service-quote/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/quote-service.md, quickstart.md

**Tests**: Included, following this repository's established convention (`specs/001`–`005`) of a test task per pure module, handler, repository and endpoint. Unit tests use hand-written fakes (no mocking library); repository tests mock the MongoDB driver's `Collection` via `tests/fakes/fakeMongoCollection.ts`; HTTP tests use `supertest` against the Express app, fake-backed — no real MongoDB calls anywhere in the automated suite. Boundary tests (SC-002) use a `FixedClock`, never the real clock.

**Organization**: Tasks are grouped by user story (from spec.md). The four stories share one linear evaluation pipeline (research.md §11), so the handler file `getServiceQuoteQueryHandler.ts` is built **incrementally**: US1 lays down the successful path, and US2, US3 and US4 each add their own steps at the positions the evaluation order gives them. All the pure building blocks (parsing, time zones, settings resolution, pricing) are finished and unit-tested in Phase 2 so the story phases stay thin.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US4); Setup, Foundational, and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

## Path Conventions

Single backend project (this repo is API-only): `src/` and `tests/` at the repository root, exactly as laid out in `plan.md`. Imports use the repo's `.js` extension convention (`NodeNext`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new directories this feature needs — research.md §3 confirms zero new npm packages (time zones use built-in `Intl`).

- [X] T001 Create the empty directory scaffold per `plan.md`'s Project Structure: `src/domain/pricing/`, `src/application/features/goalkeeperRequests/common/`, `src/application/features/goalkeeperRequests/queries/getServiceQuote/`, `src/controllers/requests/goalkeeperRequests/`, `tests/unit/domain/pricing/`, `tests/unit/application/features/goalkeeperRequests/`
- [X] T002 [P] Confirm no `package.json`, `.env`, `.env.example` or `src/infrastructure/config.ts` change is required for this feature (plan.md Constraints, research.md §3, §6) — no new dependency, no new environment variable
- [X] T003 [P] **Manual, data owner — done 2026-09-20**: confirmed the country link is `city.regionId → region.countryId → country._id` (cities have no `countryId`); recorded in `specs/007-goalkeeper-service-quote/research.md` §8

**Checkpoint**: Directory structure ready; no application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The read-only entities and ports, the pure building blocks, the repositories and the test fakes that every one of the four user stories consumes. Nothing here changes an existing behavior — the new `City`/`Region` fields are optional and default to `null`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Domain, ports and pure modules

- [X] T004 [P] Add `timeZone: string | null` to `City` — optional in the constructor params, defaulting to `null`, so no existing call site or test changes (a city has no `countryId`: its country is found through its region) — in `src/domain/locations/city.ts`, per `data-model.md`
- [X] T005 [P] Add `countryId: string | null` to `Region` (optional in the constructor params, default `null`) in `src/domain/locations/region.ts`, per `data-model.md`
- [X] T006 [P] Create `InvalidConfigurationError extends Error` (a stored rate/settings/time-zone value is malformed; carries a message naming the document) in `src/domain/pricing/invalidConfigurationError.ts`. The existing `errorHandler` already turns any non-`ApiError` into a generic 500 with the detail only in the log (research.md §6)
- [X] T007 [P] Create the `RentalRate` entity (`scope: 'zone' | 'city'`, `refId`, `durationMinutes: 60 | 90 | 120`, `amount`, `currency`; extends `Entity<string>`) in `src/domain/pricing/rentalRate.ts`. The constructor validates and throws `InvalidConfigurationError` when `scope` is unknown, `durationMinutes` ∉ {60, 90, 120}, `amount` is not an integer > 0, or `currency` is not a 3-letter uppercase code (data-model.md) (depends on T006) _(Amended in Phase 8: `RentalRate` no longer has a `currency`; it is the country's.)_
- [X] T008 [P] Create the `BookingSettings` entity (`scope: 'country' | 'city'`, `refId`, `bookingWindowDays: number | null`, `minNoticeMinutes: number | null`, `leadTimeSurcharge: LeadTimeSurcharge | null`) and export `SurchargeTier { fromMinutes; toMinutes: number | null; amount }` and `LeadTimeSurcharge { currency; tiers }` in `src/domain/pricing/bookingSettings.ts`. The constructor throws `InvalidConfigurationError` when: `bookingWindowDays` is set and not an integer ≥ 1; `minNoticeMinutes` is set and not an integer ≥ 0; tiers are unsorted or overlapping; `fromMinutes` < 0; `toMinutes` ≤ `fromMinutes`; a non-last tier is unbounded; an `amount` is not an integer ≥ 0; or `currency` is not a 3-letter uppercase code. Gaps between tiers are legal (data-model.md) (depends on T006) _(Amended in Phase 8: `LeadTimeSurcharge` no longer has a `currency`.)_
- [X] T009 [P] Define the `IClock { now(): Date }` port in `src/application/common/clock.ts` (research.md §5)
- [X] T010 [P] Extend `IZoneRepository` with `findActiveContainingPoint(latitude: number, longitude: number): Promise<Zone | null>` (existing members unchanged) in `src/application/features/zones/common/ports.ts`
- [X] T011 [P] Define `IRentalRateRepository.findForDuration(zoneId, cityId, durationMinutes): Promise<{ zone: RentalRate | null; city: RentalRate | null }>` and `IBookingSettingsRepository.findFor(cityId, countryId: string | null): Promise<{ city: BookingSettings | null; country: BookingSettings | null }>` — minimal, read-only, no `IRepository` extension (mirrors `IZoneRepository`) — in `src/application/features/goalkeeperRequests/common/ports.ts` (depends on T007, T008)
- [X] T012 [P] Implement `parseStartsAt(raw: string): ParsedStartsAt | null` and export the `LocalDateTime` (`year, month, day, hour, minute, second, millisecond`) and `ParsedStartsAt` (`{ local: LocalDateTime; offsetMinutes: number | null }`) types in `src/application/features/goalkeeperRequests/common/startsAt.ts`. Accepts `YYYY-MM-DDTHH:mm[:ss[.fraction]][Z|±HH:mm]` (`Z` ⇒ offset 0, absent ⇒ `null`); returns `null` for impossible calendar dates (Feb 30), hour > 23, minute > 59, second > 59, or any other shape. **Never** calls `Date.parse` (it reads offset-less strings in the server's zone — research.md §4)
- [X] T013 [P] Implement the `Intl`-based time-zone helpers in `src/application/features/goalkeeperRequests/common/zonedTime.ts` (research.md §3): `isValidTimeZone(id)`; `zoneOffsetMinutes(timeZone, epochMs)` (cache one `Intl.DateTimeFormat` per zone; format to parts, rebuild with `Date.UTC`, subtract); `toLocalParts(epochMs, timeZone): LocalDateTime`; `resolveLocalDateTime(local, timeZone): { kind: 'ok'; epochMs } | { kind: 'nonexistent' } | { kind: 'ambiguous' }` (probe the offset one day before and one day after the local wall time, keep candidates whose own offset matches: 0 ⇒ nonexistent, 2 ⇒ ambiguous, 1 ⇒ ok); `localDayNumber(parts): number` (whole days since epoch of the local calendar date, for window arithmetic); `formatLocalIso(epochMs, timeZone): string` (`YYYY-MM-DDTHH:mm:ss±HH:mm`) (depends on T012 for `LocalDateTime`)
- [X] T014 [P] Implement `resolveBookingSettings(docs: { city: BookingSettings | null; country: BookingSettings | null }): { bookingWindowDays: number | null; minNoticeMinutes: number | null; leadTimeSurcharge: LeadTimeSurcharge | null; missing: MissingSetting[] }` and export `type MissingSetting = 'bookingWindowDays' | 'minNoticeMinutes' | 'leadTimeSurcharge' | 'leadTimeSurchargeCurrency'` in `src/application/features/goalkeeperRequests/common/resolveBookingSettings.ts`. Each of the three settings resolves independently: `city.field ?? country.field`; a field absent at both levels is `null` and its name is added to `missing` (FR-025, data-model.md). No built-in defaults (depends on T008)
- [X] T015 [P] Implement the pricing helpers in `src/application/features/goalkeeperRequests/common/pricing.ts`: `selectUnitRate({ zone, city }): RentalRate | null` (zone rate wins, else city rate, else `null` — FR-012); `selectSurchargeTier(tiers, leadMinutes): SurchargeTier | null` (`fromMinutes` inclusive, `toMinutes` exclusive, `null` = unbounded; no match ⇒ `null` — research.md §9); `computeAmounts(unitRate, goalkeeperCount, surcharge): { subtotal; total }` (integer arithmetic only) (depends on T007, T008)
- [X] T016 Define `GetServiceQuoteQuery` (carries `ServiceQuoteInput { latitude; longitude; startsAt: ParsedStartsAt; goalkeeperCount: 1 | 2; durationMinutes: 60 | 90 | 120 }`), `ServiceQuote` (`unitRate, goalkeeperCount, subtotal, surcharge, total, currency, startsAt, startsAtLocal, timeZone`) and the **complete** `GetServiceQuoteResult` discriminated union — `success`, `location_not_covered`, `time_zone_not_configured`, `invalid_start_time` (`reason`), `start_time_in_past`, `service_not_configured` (`missing`), `insufficient_notice` (`minNoticeMinutes`), `outside_booking_window` (`bookingWindowDays`), `rate_not_configured` — in `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.ts`, exactly as in `data-model.md` "Transient types" (depends on T012, T014)

### Infrastructure

- [X] T017 [P] Create `SystemClock implements IClock` (`now: () => new Date()`) in `src/infrastructure/systemClock.ts` (depends on T009)
- [X] T018 [P] Update `CityRepository.fromDocument` to read `timeZone` (`?? null`), as-is. The IANA-identifier check is deliberately **not** done here (it would also break the existing city-search and zone-preview endpoints if one city held a bad value); the quote handler rejects an invalid identifier with `InvalidConfigurationError` instead (T041) — in `src/infrastructure/persistence/mongo/cityRepository.ts` (depends on T004)
- [X] T019 [P] Update `RegionRepository.fromDocument` to read `countryId` (`?? null`) in `src/infrastructure/persistence/mongo/regionRepository.ts` (depends on T005)
- [X] T020 [P] Add `findActiveContainingPoint` to `ZoneRepository`: `find({ active: true, geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [longitude, latitude] } } } }).sort({ displayOrder: 1, _id: 1 }).limit(1)`, returning the mapped `Zone` or `null`. Do **not** add a `2dsphere` index to `ensureIndexes()` (research.md §2) — in `src/infrastructure/persistence/mongo/zoneRepository.ts` (depends on T010)
- [X] T021 [P] Create `RentalRateRepository` (collection `rentalRates`, read-only, no write methods): `findForDuration` runs one `find({ durationMinutes, $or: [{ scope: 'zone', refId: zoneId }, { scope: 'city', refId: cityId }] })` and splits the ≤ 2 results into `{ zone, city }`; `ensureIndexes()` creates the unique `(scope, refId, durationMinutes)` index; mapping goes through the `RentalRate` constructor so malformed documents throw — in `src/infrastructure/persistence/mongo/rentalRateRepository.ts` (depends on T007, T011)
- [X] T022 [P] Create `BookingSettingsRepository` (collection `bookingSettings`, read-only): `findFor` runs one `find({ $or: [{ scope: 'city', refId: cityId }, ...(countryId ? [{ scope: 'country', refId: countryId }] : [])] })` and splits the results into `{ city, country }`; `ensureIndexes()` creates the unique `(scope, refId)` index; mapping goes through the `BookingSettings` constructor — in `src/infrastructure/persistence/mongo/bookingSettingsRepository.ts` (depends on T008, T011)

### Test fakes

- [X] T023 [P] Create `FixedClock implements IClock` with `set(date)` and `advance(ms)`, defaulting to a fixed instant, in `tests/fakes/fakeClock.ts` (depends on T009)
- [X] T024 [P] Create `FakeRentalRateRepository` with `seed(rate)` and `findForDuration` filtering the seeded rates the same way the real query does, in `tests/fakes/fakeRentalRateRepository.ts` (depends on T011)
- [X] T025 [P] Create `FakeBookingSettingsRepository` with `seed(settings)` and `findFor` returning the seeded `city`/`country` documents, in `tests/fakes/fakeBookingSettingsRepository.ts` (depends on T011)
- [X] T026 [P] Extend `FakeZoneRepository` with `findActiveContainingPoint`: a simple ray-casting point-in-polygon over the exterior ring of `Polygon` and each `MultiPolygon` member (GeoJSON `[lng, lat]` order), filtering `active`, returning the match with the lowest `displayOrder` then `id` — in `tests/fakes/fakeZoneRepository.ts` (depends on T010)

### Tests for Foundational

- [X] T027 [P] Write `tests/unit/application/features/goalkeeperRequests/zonedTime.test.ts`: offsets for `America/Bogota` (−300), `Asia/Kolkata` (+330), `Asia/Kathmandu` (+345); `America/New_York` 2026-03-08 02:30 ⇒ `nonexistent`, 2026-11-01 01:30 ⇒ `ambiguous`, 03:00 ⇒ `ok`; `Australia/Lord_Howe` 2026-10-04 02:15 ⇒ `nonexistent`; `isValidTimeZone` true/false; `toLocalParts` round-trips; `localDayNumber` differences across a month/year boundary; `formatLocalIso` shows the right offset (covers SC-008) (depends on T013)
- [X] T028 [P] Write `tests/unit/application/features/goalkeeperRequests/startsAt.test.ts`: with and without `Z`/`±HH:mm`, with and without seconds/fraction; rejects `2026-02-30T10:00`, `24:00`, `10:60`, `10:00:60`, lowercase `t`, a date without a time, a trailing garbage suffix; never depends on the process time zone (run one case under a changed `process.env.TZ`) (depends on T012)
- [X] T029 [P] Write `tests/unit/application/features/goalkeeperRequests/resolveBookingSettings.test.ts`: city wins over country per field; partial city override inherits the rest; only country; only city; none ⇒ all three names in `missing`; country `null` handled (depends on T014)
- [X] T030 [P] Write `tests/unit/application/features/goalkeeperRequests/pricing.test.ts`: `selectUnitRate` (zone wins, city fallback, neither ⇒ `null`); `selectSurchargeTier` at leads `29.99`, `30`, `59.99`, `60`, `119.99`, `120`, `500` against the Colombian tiers; a gap ⇒ `null`; `computeAmounts` for counts 1 and 2 (depends on T015)
- [X] T031 [P] Write `tests/unit/domain/pricing/rentalRate.test.ts`: valid construction; each invalid case from T007 throws `InvalidConfigurationError` (depends on T007)
- [X] T032 [P] Write `tests/unit/domain/pricing/bookingSettings.test.ts`: valid construction incl. absent fields; each invalid case from T008 (window 0 or 1.5, negative notice, overlapping/unsorted tiers, non-last unbounded tier, negative amount, bad currency) throws; a gap between tiers is accepted (depends on T008)
- [X] T033 [P] Update `tests/unit/infrastructure/persistence/mongo/cityRepository.test.ts`: `timeZone` mapped when present, `null` when absent (depends on T018)
- [X] T034 [P] Update `tests/unit/infrastructure/persistence/mongo/regionRepository.test.ts`: `countryId` mapped/`null` (depends on T019)
- [X] T035 [P] Update `tests/unit/infrastructure/persistence/mongo/zoneRepository.test.ts`: `findActiveContainingPoint` passes the exact filter (`[longitude, latitude]` order, `active: true`, `$geoIntersects` Point) and sort `{ displayOrder: 1, _id: 1 }` with limit 1; returns `null` on no match; does not call `createIndex` with a `2dsphere` spec from `ensureIndexes()` (depends on T020)
- [X] T036 [P] Write `tests/unit/infrastructure/persistence/mongo/rentalRateRepository.test.ts` with `createFakeCollection`: the `$or` filter and duration, zone/city split (both, one, none), a malformed document throws, `ensureIndexes` creates the unique index (depends on T021)
- [X] T037 [P] Write `tests/unit/infrastructure/persistence/mongo/bookingSettingsRepository.test.ts` with `createFakeCollection`: the `$or` filter with and without a `countryId`, city/country split, a malformed document throws, `ensureIndexes` creates the unique index (depends on T022)

**Checkpoint**: Foundation ready — every pure rule is unit-tested, repositories and fakes exist, and no user-visible behavior has changed. User story work can begin.

---

## Phase 3: User Story 1 - Get the total price for a goalkeeper booking (Priority: P1) 🎯 MVP

**Goal**: A signed-in client posts a location, a start time, a goalkeeper count and a duration and receives the full breakdown — unit rate, subtotal, lead-time surcharge, total, currency, plus the resolved start instant, its city-local form and the city's time zone. Start times are read in the pitch city's time zone, so the same request works in cities in different zones.

**Independent Test**: With a covered zone that has its own rate and country-level settings seeded, request quotes across every duration, both counts and the three surcharge tiers and confirm each figure; request the same offset-less local time in two cities in different time zones and confirm each is read in its own zone; send an explicit offset and confirm the same instant and city-local form come back (spec Story 1, scenarios 1–8).

### Tests for User Story 1

- [X] T038 [P] [US1] Write `tests/unit/application/features/goalkeeperRequests/getServiceQuoteQueryHandler.test.ts` (new file, fakes + `FixedClock`) covering Story 1: 60 min × 1 goalkeeper with lead ≥ 120 ⇒ 40.000 / 0 / 40.000 COP; 2 goalkeepers doubles the subtotal; each of 60/90/120 uses its own rate; lead 45 ⇒ 10.000 surcharge; lead 90 ⇒ 5.000; lead exactly 120 ⇒ 0; two cities in different time zones with the same offset-less `15:00` resolve to different instants and each returns its own `timeZone`; an explicit `-05:00` offset in a `-04:00` city converts to the same instant and returns the right `startsAtLocal`; a DST-gap or ambiguous offset-less time returns `invalid_start_time` with the matching `reason` (SC-001, SC-008)
- [X] T039 [P] [US1] Write `tests/http/controllers/goalkeeperRequestsQuote.test.ts` (new file, `supertest`, signs in via the fake Google validator like `zonesGetZones.test.ts`): `200` with the full body shape from `contracts/quote-service.md` for the worked example; `401` with no token; `403` for a client with an incomplete profile (SC-001)

### Implementation for User Story 1

- [X] T040 [P] [US1] Create the controller-level input schema in `src/controllers/requests/goalkeeperRequests/getServiceQuoteRequest.ts`: `getServiceQuoteRequestSchema = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), startsAt: z.string().refine((v) => parseStartsAt(v) !== null, …), goalkeeperCount: z.union([z.literal(1), z.literal(2)]), durationMinutes: z.union([z.literal(60), z.literal(90), z.literal(120)]) })` (strict types — `"6.2"` is rejected; all five required), and the helper `zodFieldErrors(error: ZodError): Record<string, string>` (first message per dotted field path) that the global `errorHandler` does not provide (research.md §4) (depends on T012)
- [X] T041 [US1] Create `GetServiceQuoteQueryHandler` in `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.ts` — constructor `(zoneRepository: IZoneRepository, cityRepository: ICityRepository, regionRepository: IRegionRepository, rentalRateRepository: IRentalRateRepository, bookingSettingsRepository: IBookingSettingsRepository, clock: IClock)` — implementing the **successful-path steps** of research.md §11, each failing step returning its typed outcome: (1) `findActiveContainingPoint` — `null` ⇒ `location_not_covered`; (2) `cityRepository.getById(zone.cityId)` — missing city throws a plain `Error` (dangling zone ⇒ logged 500), `timeZone === null` ⇒ `time_zone_not_configured`; (3) instant: `offsetMinutes` given ⇒ `Date.UTC(local…) − offset·60 000`; otherwise `resolveLocalDateTime` — `nonexistent`/`ambiguous` ⇒ `invalid_start_time` with `reason: 'nonexistent_local_time' | 'ambiguous_local_time'`; (4) country id = `(await regionRepository.getByIds([city.regionId]))[0]?.countryId ?? null` (city → region → country); (5) rates and settings fetched in parallel (`Promise.all`); (6) `resolveBookingSettings` — non-empty `missing` ⇒ `service_not_configured`; (7) unit rate = **`rates.zone` only for now**, `null` ⇒ `rate_not_configured` (US2 replaces this with the zone→city fallback); (8) `leadMinutes = (instant − clock.now()) / 60 000`, `selectSurchargeTier(...)` ⇒ `surcharge = tier?.amount ?? 0`; (9) `computeAmounts`, then return `success` with `startsAt` (UTC ISO), `startsAtLocal` (`formatLocalIso`), `timeZone`. Read-only: no repository write method is called (FR-020) (depends on T007–T016, T018–T022)
- [X] T042 [US1] Create `createGoalkeeperRequestsController(deps)` in `src/controllers/goalkeeperRequestsController.ts` (deps type `{ mediator: ISender; verifyAccessToken }`, like `ZonesControllerDependencies`): `router.use(requireAuth(deps.verifyAccessToken), requireClientOnly(), requireCompleteProfile())`; `router.post('/quote', …)` runs `getServiceQuoteRequestSchema.safeParse(req.body ?? {})` — failure throws `ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(error))` — then sends `new GetServiceQuoteQuery({ …, startsAt: parseStartsAt(startsAt)! })` and maps **every** outcome with an exhaustive `switch` (a `never` default so a missing case fails compilation): `success` ⇒ `200` body per contract; `400`s `location_not_covered`, `invalid_start_time` (extra `reason`), `start_time_in_past`, `insufficient_notice` (extra `minNoticeMinutes`, message: "There is not enough time for a goalkeeper to reach the zone."), `outside_booking_window` (extra `bookingWindowDays`); `422`s `time_zone_not_configured`, `service_not_configured` (extra `missing`), `rate_not_configured` — codes, statuses and extras exactly as `contracts/quote-service.md` (depends on T016, T040, T041)
- [X] T043 [US1] Mount the router in `src/app.ts`: import `createGoalkeeperRequestsController` and add `app.use('/api/goalkeeper-requests', createGoalkeeperRequestsController(deps));` beside the other feature routers (depends on T042)
- [X] T044 [US1] Wire production dependencies in `src/infrastructure/di.ts`: construct `RentalRateRepository`, `BookingSettingsRepository` and `SystemClock` from the existing `db`; `await rentalRateRepository.ensureIndexes()` and `await bookingSettingsRepository.ensureIndexes()` beside the existing `ensureIndexes()` calls; register `{ requestType: GetServiceQuoteQuery, handler: new GetServiceQuoteQueryHandler(zoneRepository, cityRepository, regionRepository, rentalRateRepository, bookingSettingsRepository, clock) }` in `registerHandlers` (depends on T017, T021, T022, T041)
- [X] T045 [US1] Extend `tests/http/testAppFactory.ts` with a shared "quote world" (`tests/fixtures/quoteFixtures.ts`, also used by the handler tests) built from its **own** cities — Cali (Colombia; three zones exercising own-rate / partial-rate / pure-fallback), Mexico City (`America/Mexico_City`, MXN), New York (`America/New_York`, DST) and New Delhi (`Asia/Kolkata`, +05:30) — each with a rectangular zone, rates and country-level settings, so the existing Medellín/Bogotá fixtures and the suites that assert on them are untouched; register `GetServiceQuoteQuery`/handler with a `FixedClock`; expose `clock`, `rentalRateRepository` and `bookingSettingsRepository` on `TestAppContext` — the existing HTTP suites must keep passing (depends on T023–T026, T041)

**Checkpoint**: A successful quote works end to end (`npm test` for the handler tests, `npm run test:http` for the endpoint). US1 is demonstrable on its own: valid requests get correct prices in any configured city.

---

## Phase 4: User Story 2 - Fall back to the city rate when the zone has no price (Priority: P1)

**Goal**: When the identified zone has no rate for the requested duration, the city's rate for that duration is used; the zone rate always wins when present; the fallback is decided per duration; and with neither, the quote is refused with a specific reason and no price.

**Independent Test**: Quote in a zone with no 90-minute rate while its city has one ⇒ city rate; quote in a zone that has its own 60-minute rate ⇒ zone rate; a zone with a 60-minute rate but no 120-minute rate quoting 120 ⇒ city 120 rate; neither level ⇒ `rate_not_configured`, no price (spec Story 2, scenarios 1–4).

### Tests for User Story 2

- [X] T046 [P] [US2] Extend `tests/unit/application/features/goalkeeperRequests/getServiceQuoteQueryHandler.test.ts` with Story 2: zone rate missing ⇒ city rate applied per goalkeeper; both present ⇒ zone rate; zone has 60 but not 120 and 120 is requested ⇒ city 120 rate; no rate at either level ⇒ `rate_not_configured` and no quote object (SC-006)
- [X] T047 [P] [US2] Extend `tests/http/controllers/goalkeeperRequestsQuote.test.ts` with Story 2: a fallback request returns `200` using the city rate; a duration with no rate seeded returns `422` `rate_not_configured` and no price fields

### Implementation for User Story 2

- [X] T048 [US2] In `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.ts` replace the interim "zone rate only" line of step (7) with `selectUnitRate(rates)` from `pricing.ts` (zone → city, per duration by construction because the repository already filtered on the requested duration); a `null` result still returns `rate_not_configured` (research.md §7, FR-012, FR-014) (depends on T041, T015)

**Checkpoint**: US1 and US2 both work. Any covered location gets a price whenever the zone or its city has one.

---

## Phase 5: User Story 3 - Refuse quotes that break the booking rules (Priority: P1)

**Goal**: Every way a request can be unquotable produces its own identifiable refusal and never a price: bad input (with the offending fields named), location not covered, start time not on a local 30-minute mark, in the past, under the minimum notice, or beyond the booking window.

**Independent Test**: Send one request per rule, each breaking only that rule, and confirm each returns its own distinct error code with no price (spec Story 3, scenarios 1–8); send a request breaking two rules and confirm the earlier rule in the evaluation order is the one reported.

### Tests for User Story 3

- [X] T049 [P] [US3] Extend `tests/unit/application/features/goalkeeperRequests/getServiceQuoteQueryHandler.test.ts` with Story 3 using `FixedClock`: coordinates in no zone ⇒ `location_not_covered`; an inactive zone only ⇒ `location_not_covered`; an off-mark start (`15:15`, `15:00:30`, and an instant that lands on `:15` in a +5:30 city) ⇒ `invalid_start_time` `not_on_slot`; a start earlier than now ⇒ `start_time_in_past` (also for a slot that began earlier today); lead 29 min 59 s ⇒ `insufficient_notice` and exactly 30 min ⇒ success; request at 14:10 for 14:30 ⇒ `insufficient_notice` while 15:00 succeeds; window 2 with start 23:30 tomorrow ⇒ success and 00:00 the day after ⇒ `outside_booking_window`; a city whose local date differs from the UTC date is judged on its **local** date; two overlapping zones ⇒ the lower `displayOrder` wins, identical coordinates always resolve identically (FR-011, SC-002)
- [X] T050 [P] [US3] Add an evaluation-order test to the same handler test file: a request that is both off-mark **and** in the past reports `invalid_start_time`; both in the past **and** in an unconfigured area reports `start_time_in_past` (past is checked before settings); insufficient-notice in an unconfigured area reports `service_not_configured` (research.md §11)
- [X] T051 [P] [US3] Extend `tests/http/controllers/goalkeeperRequestsQuote.test.ts` with Story 3, one request per code, asserting HTTP status, `error` and extras from `contracts/quote-service.md`: `400 validation_failed` with `fieldErrors` naming each offending field (missing field, `"latitude": 95`, `"longitude": -181`, `"goalkeeperCount": 3`, `"durationMinutes": 45`, a string where a number is required, unparseable `startsAt`, empty body); `400 location_not_covered`; `400 invalid_start_time` (`reason: 'not_on_slot'`); `400 start_time_in_past`; `400 insufficient_notice` (`minNoticeMinutes: 30`); `400 outside_booking_window` (`bookingWindowDays: 2`); assert every refusal body contains no price fields (SC-004)

### Implementation for User Story 3

- [X] T052 [US3] In `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.ts` add the time-rule steps at the positions research.md §11 gives them: after step (3) compute `toLocalParts(instant, timeZone)` and return `invalid_start_time` `reason: 'not_on_slot'` unless local `minute ∈ {0, 30}` and `second === 0` and `millisecond === 0`; then return `start_time_in_past` when `instant < clock.now()`; after step (6) return `insufficient_notice` (`minNoticeMinutes`) when `(instant − now) < minNoticeMinutes · 60 000` (exactly the minimum is accepted); then return `outside_booking_window` (`bookingWindowDays`) when `localDayNumber(local start) − localDayNumber(toLocalParts(now, timeZone)) > bookingWindowDays − 1` (depends on T041, T013)

**Checkpoint**: US1–US3 work. Every refusal in the contract's 400 group is reachable and distinct.

---

## Phase 6: User Story 4 - Configure booking rules per country, with city overrides (Priority: P2)

**Goal**: The booking window, minimum notice and surcharge tiers come from stored settings defined per country and overridable per city, each resolved independently; an area with any setting missing at both levels is refused and never priced; a surcharge in a different currency than the rate is refused; two countries never share values.

**Independent Test**: Configure a country and quote in one of its cities; change a value and see it honored; add a city override and see only that city change; remove the configuration and see `service_not_configured`; configure a second country with a different currency and see no cross-over (spec Story 4, scenarios 1–9).

### Tests for User Story 4

- [X] T053 [P] [US4] Extend `tests/unit/application/features/goalkeeperRequests/getServiceQuoteQueryHandler.test.ts` with Story 4: no settings at either level ⇒ `service_not_configured` with all three names in `missing` and no price; only the window missing ⇒ `missing: ['bookingWindowDays']`; window 4 ⇒ up to three days ahead allowed and beyond refused; notice 45 ⇒ 40 minutes refused; a changed tier amount (12.000) and changed tier boundaries (middle tier 60–179) are honored; city override applies only to its own city while a sibling city inherits the country; a city overriding only tiers still inherits window and notice; a city whose country cannot be determined is quotable only with city-level settings; two countries with different values **and currencies** never cross over (SC-005, SC-009)
- [X] T054 [P] [US4] Add currency and time-zone-configuration cases to the same handler test file: tiers in `COP` with a rate in `MXN` ⇒ `service_not_configured` with `missing: ['leadTimeSurchargeCurrency']`; a city with `timeZone === null` ⇒ `time_zone_not_configured` (FR-023); a dangling zone (its city does not exist) makes `handle` reject with an `Error` _(Amended in Phase 8: the currency-mismatch case no longer exists; currency cases now concern the country's `currency`.)_
- [X] T055 [P] [US4] Extend `tests/http/controllers/goalkeeperRequestsQuote.test.ts` with Story 4: `422 service_not_configured` with the `missing` list for an unconfigured area; `422 service_not_configured` for the currency mismatch; `422 time_zone_not_configured`; the second-country fixture returns its own currency and time zone; a malformed stored settings document (seed a `BookingSettings`-shaped stub that throws `InvalidConfigurationError` from the fake repository) returns `500 internal_error` with no internal detail in the body (FR-044 of `001`) _(Amended in Phase 8: the currency-mismatch case was replaced by a missing-country-currency case.)_

### Implementation for User Story 4

- [X] T056 [US4] In `src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQueryHandler.ts` add the currency guard to step (8): when `leadTimeSurcharge.currency !== rate.currency` return `service_not_configured` with `missing: ['leadTimeSurchargeCurrency']` before computing amounts — never add amounts in two currencies (FR-017, research.md §9) (depends on T041, T048) _(**Superseded in Phase 8 (T065)**: the currency guard was removed; the currency now comes from the country.)_
- [X] T057 [US4] In `src/controllers/goalkeeperRequestsController.ts` log a `warn` through the existing `logger` (`src/infrastructure/observability/logger.ts`) with the outcome, `cityId` and `missing` whenever the result is `service_not_configured`, `time_zone_not_configured` or `rate_not_configured`, so an unconfigured launch area is visible to operators; the response body is unchanged (research.md §11) (depends on T042)

**Checkpoint**: All four stories work. Opening a new country is a data change only — settings, rates and city time zones — with no release.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, the no-side-effects guarantee, and the full quality gate.

- [X] T058 [P] Document `POST /api/goalkeeper-requests/quote` in `src/infrastructure/openapi/openapiSpec.ts` following the existing path entries: request schema (five fields, `startsAt` offset behavior), the `200` schema, and the `400`/`401`/`403`/`422`/`500` responses with each `error` code from `contracts/quote-service.md`
- [X] T059 [P] Add a read-only guarantee test (SC-007) in `tests/unit/application/features/goalkeeperRequests/getServiceQuoteQueryHandler.test.ts`: run several quotes (success and refusals) with fakes whose write-capable members would throw or record, and assert no repository method other than the read methods of the ports was called and the seeded data is unchanged; also assert `IRentalRateRepository`/`IBookingSettingsRepository` expose no write method at all
- [X] T060 Run the full gate and fix anything it reports: `npm test && npm run lint`, then `npm run test:http` and `npm run test:architecture` (the layering test proves `src/domain` and `src/application` gained no infrastructure or controller import)
- [ ] T061 **Manual, data owner**: run quickstart.md §2–§6 against the target database (verify city `timeZone` values — already loaded —, Colombian `bookingSettings` — already loaded, verify coverage —, `rentalRates` — already loaded, verify coverage —, optional `2dsphere` index, polygon validity check), then §7–§8 end to end, and tick the acceptance mapping in §9. Colombia cannot be quoted until this is done — there are no defaults (FR-025) _(Status 2026-09-21: rates, settings, time zones and currency verified against the development database; the real-data quote works for 12 of 13 zones. Zone "Suroccidental" has an invalid `MultiPolygon` (crossing edges) that MongoDB silently ignores — the data owner fixed it on 2026-09-23 (one spike vertex removed) and the sweep was re-run: all 13 active zones now validate strictly and quote for 60/90/120. The optional `2dsphere` index (`geometry_2dsphere`) was then created and verified: the app's query uses it and the sweep still passes 13 of 13. Still open: the HTTP-level check with a token.)_

---

## Phase 8: Amendment — the currency moves to the country (2026-09-21)

**Why**: the data owner pointed out that a country has exactly one currency, so storing it on every rental rate and every surcharge tier is redundant and lets two rows disagree. The currency is now a `currency` property of the **country** (`countries.currency`) and every amount in a quote is in it. The per-row currency and the currency-mismatch refusal (T056) are gone. See spec.md Clarifications (Q4), research.md §10 and data-model.md.

- [X] T062 [P] Add `currency: string | null` (optional, default `null`) to `Country` in `src/domain/countries/country.ts`; read it as stored in `CountryRepository.fromDocument` in `src/infrastructure/persistence/mongo/countryRepository.ts` (validation is deliberately **not** done there — the repository also serves the profile and country endpoints)
- [X] T063 [P] Remove `currency` from `RentalRate` (`src/domain/pricing/rentalRate.ts`) and from `LeadTimeSurcharge` (`src/domain/pricing/bookingSettings.ts`); stop mapping it in `src/infrastructure/persistence/mongo/rentalRateRepository.ts` and read only `tiers` from `leadTimeSurcharge` in `src/infrastructure/persistence/mongo/bookingSettingsRepository.ts` (a leftover `currency` key in stored documents is ignored)
- [X] T064 Add the narrow read-only `ICountryLookup { getById(id): Promise<Country | null> }` to `src/application/features/goalkeeperRequests/common/ports.ts`; replace `'leadTimeSurchargeCurrency'` with `'currency'` in `MissingSetting` (`src/application/features/goalkeeperRequests/common/resolveBookingSettings.ts`)
- [X] T065 In `getServiceQuoteQueryHandler.ts`: inject `ICountryLookup` (after `regionRepository`); fetch the country in the same `Promise.all` as the rates and settings; take `currency` from `country.currency`; throw `InvalidConfigurationError` when it is present but not 3 uppercase letters; when it is `null`, return `service_not_configured` with `'currency'` appended after the other missing settings; delete the old currency guard (T056). Wire `countryRepository` into the handler in `src/infrastructure/di.ts`
- [X] T066 Update the fixtures and tests: `tests/fixtures/quoteFixtures.ts` seeds countries with a currency into a **dedicated** `FakeCountryRepository` (passed to `seedQuoteWorld`; `testAppFactory.ts` exposes it as `quoteCountryRepository`, so the profile/locations suites are untouched) and no longer puts a currency on rates or tiers; `FakeCountryRepository.clear()`; handler tests for currency-from-country, no currency, no country document, currency listed last among missing, malformed currency (`cop`, `COPP`, `Peso`, `''`, `CO`) and a city whose region has no country being unquotable even with city-level settings; HTTP tests for the `missing: ['currency']` 422 and the malformed-currency 500; `CountryRepository` tests for the new field; the read-only test allows `countries.getById`
- [X] T067 [P] Update `src/infrastructure/openapi/openapiSpec.ts` (`currency` description, `missing` values) and the docs: spec.md, plan.md, research.md §10, data-model.md, contracts/quote-service.md, quickstart.md (new §1b), CLAUDE.md

**Checkpoint**: `npm test && npm run lint`, `npm run test:http` and `npm run test:architecture` are green with the currency on the country.

---

## Phase 9: Amendment — booking-configuration endpoint (2026-09-23)

**Why**: the app needs to build its date/time/count/duration selectors, and until now it could only learn the booking window and the minimum notice by being refused. The window and the notice are configured per country/city, so the endpoint is **per location**: `GET /api/goalkeeper-requests/config?latitude=&longitude=`. It reuses the quote's resolution so the two can never disagree. See spec.md Clarifications (Q5), FR-026/FR-027 and contracts/booking-config.md.

- [X] T068 [P] Create `src/application/features/goalkeeperRequests/common/bookingLimits.ts` — the single source of truth for the goalkeeper counts (1–2), the duration options (60/90/120) and the slot step (30), with type guards; use it in the quote request validation (`src/controllers/requests/goalkeeperRequests/getServiceQuoteRequest.ts`, error messages generated from the constants), in the quote's types and in the slot-mark check of `getServiceQuoteQueryHandler.ts`
- [X] T069 Extract the two resolution steps the quote and the config share into `src/application/features/goalkeeperRequests/common/serviceArea.ts` (`resolveServiceArea`: point → zone → city → time zone; `resolveAreaSettings`: city → region → country, settings + currency) and refactor `getServiceQuoteQueryHandler.ts` onto them with no behavior change (the 54 existing handler tests are the safety net)
- [X] T070 Create `GetBookingConfigQuery` and `GetBookingConfigQueryHandler` in `src/application/features/goalkeeperRequests/queries/getBookingConfig/`: time zone, local `now`, `bookingWindowDays`, `availableDates` (local dates from today), `minNoticeMinutes`, `slotStepMinutes`, `earliestStartsAt` (now + notice rounded up to the next slot mark in **local** time; `null` when outside the window), the counts, the durations and the currency; refuses like the quote (`location_not_covered`, `time_zone_not_configured`, `service_not_configured`)
- [X] T071 Add `GET /config` to `src/controllers/goalkeeperRequestsController.ts` with the query-string schema `src/controllers/requests/goalkeeperRequests/getBookingConfigRequest.ts`; share the refusal builders with `/quote` so both answer identically; register the handler in `src/infrastructure/di.ts` and `tests/http/testAppFactory.ts`
- [X] T072 [P] Tests: `tests/unit/application/features/goalkeeperRequests/getBookingConfigQueryHandler.test.ts` (full config, rounding at every boundary, day rollover, month boundary, window edge ⇒ `null`, overrides, other countries, +05:30 and +05:45 zones, refusals, read-only, **agreement with the quote**: the earliest start quotes successfully and one step earlier is refused, the last available date's last slot is accepted and the next date refused), `bookingLimits.test.ts` (the quote request accepts exactly the constants) and `tests/http/controllers/goalkeeperRequestsConfig.test.ts` (200, 401/403, every validation failure, 400/422 refusals, 500, operator warning, config→quote round trip)
- [X] T073 [P] Docs: `contracts/booking-config.md` (new), OpenAPI, spec.md (Clarifications Q5, FR-026/FR-027), plan.md structure, and task 1.4 of `specs/006-find-goalkeeper/IMPLEMENTATION_PLAN.md`

**Checkpoint**: `npm test && npm run lint`, `npm run test:http` and `npm run test:architecture` are green; the quote's behavior is unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T003 is manual and never blocks code.
- **Foundational (Phase 2)**: Depends on T001 — BLOCKS every user story.
- **User Stories (Phases 3–6)**: All depend on Phase 2. Because the four stories extend one handler file, run them **sequentially in priority order** (US1 → US2 → US3 → US4); only their test files and controller/wiring files can overlap with handler work.
- **Polish (Phase 7)**: Depends on the stories you intend to ship. T061 needs the seed data and is independent of code.

### Task-level dependencies

- Phase 2: T007, T008 → T011 → T021, T022, T024, T025; T012 → T013, T016; T008 → T014 → T016; T007, T008 → T015; T013 → T018; each repository/fake test depends on the task it covers.
- US1: T040 (needs T012) and T041 (needs Phase 2) → T042 → T043; T041 + T017 + T021 + T022 → T044; T045 needs T023–T026 and T041; T038 and T039 are written first and fail until T041–T045 land.
- US2: T048 needs T041. US3: T052 needs T041 (and is placed inside the handler around the US1 steps). US4: T056 needs T048; T057 needs T042.

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on other stories. This is the MVP.
- **US2 (P1)**: After US1 (edits the same handler; adds the city fallback).
- **US3 (P1)**: After US1 (edits the same handler; adds the time-rule refusals). Independent of US2 in behavior.
- **US4 (P2)**: After US2 (the currency guard sits next to the rate step). The settings resolution itself already exists from Phase 2.

### Within Each Story

- Tests first; confirm they fail for the right reason before implementing.
- Pure modules → handler → controller → wiring → HTTP fixtures.
- Finish a story's checkpoint (`npm test && npm run lint`) before starting the next.

### Parallel Opportunities

- Phase 2: T004–T011 are all separate files ([P]); T012–T015 (pure modules) run in parallel; T017–T022 (infrastructure) and T023–T026 (fakes) run in parallel once their ports exist; T027–T037 (tests) run in parallel once their targets exist.
- Within a story: the handler test, HTTP test and schema tasks touch different files and can be written in parallel (T038 ∥ T039 ∥ T040; T046 ∥ T047; T049 ∥ T050-with-care ∥ T051 — T049/T050 share a file, so do them in one sitting; T053 ∥ T054 share a file likewise, T055 is separate).

---

## Parallel Example: Phase 2 kickoff

```text
# All independent files — launch together:
Task: "T004 Add timeZone to City in src/domain/locations/city.ts"
Task: "T005 Add countryId to Region in src/domain/locations/region.ts"
Task: "T006 Create InvalidConfigurationError in src/domain/pricing/invalidConfigurationError.ts"
Task: "T009 Define IClock in src/application/common/clock.ts"
Task: "T012 Implement parseStartsAt in src/application/features/goalkeeperRequests/common/startsAt.ts"
Task: "T023 Create FixedClock in tests/fakes/fakeClock.ts"

# Then, once their prerequisites exist:
Task: "T013 zonedTime.ts"  Task: "T014 resolveBookingSettings.ts"  Task: "T015 pricing.ts"
Task: "T027 zonedTime.test.ts"  Task: "T028 startsAt.test.ts"  Task: "T030 pricing.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational (every pure rule tested; repositories and fakes ready)
3. Phase 3: User Story 1 — a correct price for valid requests in any configured city
4. **STOP and VALIDATE**: `npm test && npm run lint && npm run test:http`; then, with the data seeded (T061), try the curl in quickstart.md §8
5. The MVP is safe to demo but not to release: without US2/US3 an unrated zone refuses generically and time-rule violations are not yet enforced

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + US1 → valid quotes work (demo)
3. + US2 → zones without their own price fall back to the city (release candidate for rates)
4. + US3 → all refusals enforced — **the first releasable increment**, because bad requests can no longer be quoted
5. + US4 → currency guard and operator warnings; per-country/city behavior fully verified
6. Polish → OpenAPI, read-only guarantee, full gate, data seeding sign-off

### Notes

- [P] tasks = different files, no dependency on an unfinished task
- A [Story] label maps every story-phase task to spec.md for traceability
- The handler is one file edited by US1, US2, US3 and US4 in order — do not parallelize those edits
- Commit after each task or logical group
- Stop at any checkpoint to validate a story on its own
