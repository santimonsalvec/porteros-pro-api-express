# Implementation Plan: Goalkeeper Service Quote

**Branch**: `007-goalkeeper-service-quote` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-goalkeeper-service-quote/spec.md`

## Summary

Add one read-only endpoint, `POST /api/goalkeeper-requests/quote`, that turns `{ latitude, longitude, startsAt, goalkeeperCount, durationMinutes }` into a price breakdown `{ unitRate, subtotal, surcharge, total, currency, startsAt, startsAtLocal, timeZone }`. The point is resolved to an active service zone with a MongoDB `$geoIntersects` lookup (deterministic tie-break); the zone's owning (anchor) city supplies the **IANA time zone**, the rate fallback and the settings scope. The unit rate is the zone's rate for the duration, else the city's; a lead-time surcharge tier is added. The booking window, minimum notice and surcharge tiers come from a new `bookingSettings` collection, defined **per country with optional per-city override, each setting resolved independently, and with no built-in defaults** — an unconfigured area is refused. All time-zone arithmetic (offset-less local times, 30-minute marks in city-local time, local calendar-day window, DST gap/overlap refusal) is implemented with the built-in `Intl` API — no new dependency. Rates live in a new `rentalRates` collection; every amount is in the currency of the country, stored once as `countries.currency` rather than on each rate or tier. Both new collections and the new `cities.timeZone` and the `regions.countryId` link are seeded by the data owner; this system only reads them.

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) — no new npm dependency. Time-zone conversion uses the runtime's built-in `Intl.DateTimeFormat` (research.md §3) rather than `luxon`; point-in-polygon is delegated to MongoDB `$geoIntersects` (research.md §2), so no geometry library is added either.
**Storage**: MongoDB — two new collections, `rentalRates` (per zone/city, per duration price) and `bookingSettings` (per country/city window, minimum notice, surcharge tiers), both seeded by the database owner and read-only from this system. Read-only use of `zones` (new point-containment query), plus a new `currency` field on the pre-existing externally-owned `countries`, a new `timeZone` field on `cities` and a `countryId` read from `regions` (the city → region → country link). See data-model.md.
**Testing**: Vitest, same three-tier convention as `001`–`005`: pure-function unit tests (`zonedTime`, `parseStartsAt`, `resolveBookingSettings`, pricing) including DST/half-hour/45-minute-offset zones; handler-level unit tests against fakes and a `FixedClock` for every boundary in SC-002; repository unit tests against the mocked `Collection` (`createFakeCollection`); `supertest` HTTP tests for the route, one per refusal code.
**Target Platform**: Linux server (same containerized Node.js process, Firebase App Hosting: `minInstances: 0`, `maxInstances: 1`, `concurrency: 80`). The handler is stateless and timer-free.
**Project Type**: Single backend web-service project (this repository is API-only).
**Performance Goals**: SC-003 — 95% of quotes answered in under 2 s. A quote is ≈4–5 small reads (zone lookup, city, region, then rates and settings in parallel); no cache is used, which makes SC-005 (config changes visible within 1 minute) hold trivially.
**Constraints**: Read-only endpoint, zero writes (FR-020, SC-007). No built-in defaults for window/notice/tiers (FR-025) — missing configuration ⇒ refusal, not assumption. `cities`, `regions`, `zones` remain read-only externally-owned collections; the app does **not** create a `2dsphere` index on `zones.geometry` (an invalid polygon would fail the build at startup — research.md §2). Amounts are integers in whole units of the country's currency, which is stored on the country (`countries.currency`), never per rate or tier (research.md §10).
**Scale/Scope**: One new route; one new query handler; two new read-only repositories plus one new method on the existing zone repository and a `timeZone` read on the city repository and a `countryId` read on the region repository; one new `IClock` port and one narrow `ICountryLookup` port; four small pure modules; no change to any other feature's code path.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no project-specific principles have been ratified, so there are no concrete gates to evaluate against. In their absence, this plan self-applies the discipline `001`–`005` established: every new read path sits behind a small, explicit, read-only repository interface (no query builder leaking into the application layer; the layering architecture test keeps `domain`/`application` free of infrastructure imports); the new handler follows the existing mediator `Query` + `Handler` + `outcome` shape and the controller maps outcomes to `ApiError`; no capability is added beyond spec FR-001–FR-025 (no booking creation, notifications, payments, admin UI, cache, or minor-unit currencies — all excluded by spec Assumptions or deferred in research.md §14). No violations to justify; no entries needed in Complexity Tracking.

*Post-Phase-1 re-check*: Unchanged — Phase 1 design (data-model.md, contracts/, quickstart.md) adds two read-only reference entities (`RentalRate`, `BookingSettings`), two nullable read-only fields on two existing reference entities (`City.timeZone`, `Region.countryId`), one port (`IClock`) and one repository method, and introduces no dependency. Gate still passes.

## Project Structure

### Documentation (this feature)

```text
specs/007-goalkeeper-service-quote/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── quote-service.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── locations/
│   │   ├── city.ts                            # MODIFIED: + timeZone (nullable, optional in ctor)
│   │   └── region.ts                          # MODIFIED: + countryId (nullable, optional in ctor)
│   └── pricing/
│       ├── rentalRate.ts                      # NEW: RentalRate entity (zone|city scope, per duration)
│       └── bookingSettings.ts                 # NEW: BookingSettings entity + SurchargeTier type
│
├── application/
│   ├── common/
│   │   └── clock.ts                           # NEW: IClock { now(): Date }
│   └── features/
│       ├── zones/
│       │   └── common/ports.ts                # MODIFIED: IZoneRepository.findActiveContainingPoint
│       └── goalkeeperRequests/
│           ├── common/
│           │   ├── ports.ts                   # NEW: IRentalRateRepository, IBookingSettingsRepository
│           │   ├── startsAt.ts                # NEW: parseStartsAt (pure, never uses Date.parse)
│           │   ├── zonedTime.ts               # NEW: isValidTimeZone, zoneOffsetMinutes, resolveLocalDateTime, toLocalParts
│           │   ├── resolveBookingSettings.ts  # NEW: city ?? country per field, reports missing[]
│           │   └── pricing.ts                 # NEW: selectUnitRate, selectSurchargeTier, totals
│           └── queries/
│               └── getServiceQuote/
│                   ├── getServiceQuoteQuery.ts         # Query + ServiceQuoteInput/ServiceQuote/Result types
│                   └── getServiceQuoteQueryHandler.ts  # orchestrates the 10-step evaluation order (research.md §11)
│
├── infrastructure/
│   ├── systemClock.ts                         # NEW: IClock over new Date()
│   ├── persistence/mongo/
│   │   ├── zoneRepository.ts                  # MODIFIED: findActiveContainingPoint ($geoIntersects, sort displayOrder,_id)
│   │   ├── cityRepository.ts                  # MODIFIED: read timeZone (as stored; the handler validates the IANA id)
│   │   ├── regionRepository.ts                # MODIFIED: read countryId
│   │   ├── rentalRateRepository.ts            # NEW: collection `rentalRates`, read-only, ensureIndexes()
│   │   └── bookingSettingsRepository.ts       # NEW: collection `bookingSettings`, read-only, ensureIndexes()
│   ├── di.ts                                  # MODIFIED: wires 2 repositories, SystemClock, handler; ensureIndexes for the 2 new ones
│   └── openapi/openapiSpec.ts                 # MODIFIED: document POST /api/goalkeeper-requests/quote
│
├── controllers/
│   ├── goalkeeperRequestsController.ts        # NEW: POST /quote behind requireAuth+requireClientOnly+requireCompleteProfile
│   └── requests/
│       └── goalkeeperRequests/
│           └── getServiceQuoteRequest.ts      # NEW: zod schema + zodFieldErrors helper
│
└── app.ts                                     # MODIFIED: app.use('/api/goalkeeper-requests', createGoalkeeperRequestsController(deps))

tests/
├── fixtures/
│   └── quoteFixtures.ts                       # NEW: shared "quote world" (Cali, Mexico City, New York, New Delhi) for handler + HTTP tests
├── unit/
│   ├── domain/pricing/                        # NEW: rentalRate.test.ts, bookingSettings.test.ts
│   ├── application/features/goalkeeperRequests/
│   │   ├── zonedTime.test.ts                  # Bogota, Kolkata, Kathmandu, New York gap/overlap, Lord Howe
│   │   ├── startsAt.test.ts
│   │   ├── resolveBookingSettings.test.ts
│   │   ├── pricing.test.ts                    # tier boundaries 59:59/60/119:59/120, gaps
│   │   └── getServiceQuoteQueryHandler.test.ts  # Stories 1–4, SC-001/002/006/009 with FixedClock + fakes
│   └── infrastructure/persistence/mongo/
│       ├── zoneRepository.test.ts             # MODIFIED: point query filter + sort
│       ├── cityRepository.test.ts             # MODIFIED: timeZone mapping
│       ├── regionRepository.test.ts           # MODIFIED: countryId mapping
│       ├── rentalRateRepository.test.ts       # NEW
│       └── bookingSettingsRepository.test.ts  # NEW
├── http/
│   ├── testAppFactory.ts                      # MODIFIED: seed the quote fixtures (cities' timeZone, regions' countryId, settings, rates), FixedClock, register handler
│   └── controllers/
│       └── goalkeeperRequestsQuote.test.ts    # NEW: 200 + one test per refusal code + 401/403
└── fakes/
    ├── fakeClock.ts                           # NEW: FixedClock with set()/advance()
    ├── fakeRentalRateRepository.ts            # NEW
    ├── fakeBookingSettingsRepository.ts       # NEW
    └── fakeZoneRepository.ts                  # MODIFIED: findActiveContainingPoint (simple ray-cast over Polygon/MultiPolygon)
```

**Structure Decision**: Same single-project layout as `001`–`005` — one new feature slice, `goalkeeperRequests`, under the existing `domain/application/infrastructure/controllers` layering, named after the resource the 006 find-goalkeeper flow will extend (`/api/goalkeeper-requests`), so later request/booking endpoints land beside the quote rather than in a throw-away module. The point lookup extends the existing `zones` port rather than creating a parallel one; `pricing` is a new domain area because `RentalRate`/`BookingSettings` are reference data with their own repositories, not part of `locations` or `zones`. No new top-level directory, test tier or architectural pattern is introduced.

## Implementation prerequisites (data, not code)

These are facts about externally-owned data that this plan tolerates but that must be true before the first successful quote; they are task 0 of the implementation and are written up step by step in [quickstart.md](./quickstart.md) §1–§4:

1. ~~Confirm where the country link lives~~ — **done**: it is `regions.countryId` (city → region → country); cities carry no `countryId` (research.md §8).
2. ~~Add `timeZone` (IANA id) to every anchor city that owns zones~~ — **done** (the data owner confirmed every city has it); only verify the values are valid IANA identifiers.
3. Seed `bookingSettings` (Colombia: window 2, notice 30, tiers 10.000/5.000/0 COP) and `rentalRates`.
4. Check every active zone's polygon is valid with the strict check (quickstart §6) — an invalid zone is silently unreachable, not an error; optionally add a `2dsphere` index (quickstart §5).

## Complexity Tracking

*No entries — Constitution Check raised no violations to justify.*
