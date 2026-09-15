# Implementation Plan: Goalkeeper Service Zones (Zone-Based Availability)

**Branch**: `005-goalkeeper-service-zones` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-goalkeeper-service-zones/spec.md`

## Summary

Replace the goalkeeper registration's KM-radius availability with polygon-zone-based availability. Two new read-only reference-data endpoints — city search (`GET /api/locations/cities`, added to the existing `locationsController`) and zone preview by city (`GET /api/zones`, a new `zonesController`) — back a city-then-zones picker; a third, existing endpoint (`PATCH /api/goalkeepers/me/availability`) changes its contract from `{ radiusKm }` to `{ cityId, zoneIds }`, validating the city exists and every zone is active and belongs to that city's resolved "anchor" (the city, possibly itself, that actually owns `Zone` documents — satellite municipalities of a metro area point to it via `cities.zoneCityId`). `GET /api/goalkeepers/me` is extended to surface the saved `cityId`/`serviceZoneIds`. `cities`, `regions`, and `zones` are pre-existing, externally owned, read-only MongoDB collections — this feature adds no seeding, only three new thin repositories mirroring the existing `CountryRepository`/`DocumentTypeRepository` read-only pattern.

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) — no new npm dependency. `Zone.geometry` (raw GeoJSON) is stored/returned opaquely; no geometry-processing library is introduced since this system never inspects or validates coordinates, only passes them through.
**Storage**: MongoDB — three pre-existing, externally owned, read-only collections newly modeled by this system: `cities` (`City`, incl. `regionId`, `zoneCityId`), `regions` (`Region`), `zones` (`Zone`). Plus a shape change to the existing `goalkeeperRegistrations`/`goalkeeperProfiles` collections' `availability`/radius fields (see data-model.md).
**Testing**: Vitest, same three-tier convention as `001`–`003`: handler-level unit tests against fakes for the two new query handlers and the modified `SaveAvailabilitySectionCommandHandler`; a repository-layer unit test per new Mongo repository (`CityRepository`, `RegionRepository`, `ZoneRepository`) against a mocked `Collection`; `supertest` HTTP tests against `/api/locations/cities`, the new `/api/zones`, and the modified `/api/goalkeepers/me/availability`.
**Target Platform**: Linux server (same containerized Node.js process as the rest of this backend).
**Project Type**: Single backend web-service project (this repository is API-only).
**Performance Goals**: No new throughput target beyond this backend's existing baseline; all three endpoints are simple reference-data reads or a single-document read/write, well within the existing request-latency profile. City search is capped at 15 results and zone-existence checks are batched (research.md §5) specifically to avoid N+1 query patterns as data grows.
**Constraints**: `PATCH /me/availability` requires `cityId` and `zoneIds` together in one request — no partial merge, unlike the other three sections (research.md §7, FR-008). Changing availability is rejected once `status === 'active'`, identical to every other section (FR-013). `cities`/`regions`/`zones` are read-only from this system — `add`/`update`/`delete` are not implemented on their repositories at all (data-model.md).
**Scale/Scope**: Two new routes (`GET /api/locations/cities`, `GET /api/zones`) plus one modified route (`PATCH /api/goalkeepers/me/availability`) and one extended route (`GET /api/goalkeepers/me`); three new Mongo repositories; two new query handlers; one modified command handler; zero changes to `identification`/`physicalData`/`location` sections or to any other existing feature's code path.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no project-specific principles have been ratified, so there are no concrete gates to evaluate against. In their absence, this plan self-applies the same discipline `001`–`004` already established: every new read path sits behind a small, explicit repository interface (no bespoke query builder leaking into application code); `cities`/`regions`/`zones` repositories follow the established *minimal, non-`IRepository`-extending, read-only* shape `IDocumentTypeRepository` set in `003` (research.md §1), not the older, heavier `ICountryRepository` shape; no capability is added beyond what spec.md's FR-001–FR-014 actually require (in particular, this plan does not add goalkeeper-search-by-zone, city/zone administration, or post-activation availability edits — all explicitly out of scope per spec Assumptions). No violations to justify; no entries needed in Complexity Tracking.

*Post-Phase-1 re-check*: Unchanged — Phase 1 design (data-model.md, contracts/, quickstart.md) introduces exactly three new read-only reference entities (`City`, `Region`, `Zone`), reshapes two existing entities' `availability`/`radiusKm` fields in place (no new entity), and adds no capability beyond what Phase 0 scoped. Gate still passes.

## Project Structure

### Documentation (this feature)

```text
specs/005-goalkeeper-service-zones/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md         # Phase 1 output (/speckit.plan command)
├── quickstart.md         # Phase 1 output (/speckit.plan command)
├── contracts/            # Phase 1 output (/speckit.plan command)
│   ├── get-cities.md
│   ├── get-zones.md
│   └── save-availability.md
└── tasks.md              # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── locations/
│   │   ├── city.ts                           # City entity (read-only reference data)
│   │   └── region.ts                         # Region entity (read-only reference data)
│   ├── zones/
│   │   └── zone.ts                           # Zone entity (read-only reference data, opaque geometry)
│   └── goalkeepers/
│       ├── goalkeeperRegistration.ts         # MODIFIED: AvailabilitySection { cityId, zoneIds } replaces { radiusKm }
│       └── goalkeeperProfile.ts              # MODIFIED: cityId/zoneIds replace radiusKm
│
├── application/
│   └── features/
│       ├── locations/
│       │   ├── common/
│       │   │   ├── ports.ts                       # NEW: ICityRepository, IRegionRepository
│       │   │   └── resolveAnchorCityId.ts             # NEW: pure fn, city.zoneCityId ?? city.id
│       │   └── queries/
│       │       ├── getCountries/                  # unchanged
│       │       └── getCities/
│       │           ├── getCitiesQuery.ts
│       │           └── getCitiesQueryHandler.ts       # search + batched hasZones (research.md §5)
│       ├── zones/
│       │   ├── common/
│       │   │   └── ports.ts                       # NEW: IZoneRepository
│       │   └── queries/
│       │       └── getZonesByCity/
│       │           ├── getZonesByCityQuery.ts
│       │           └── getZonesByCityQueryHandler.ts  # resolves anchor, 404 outcomes (research.md §9)
│       └── goalkeepers/
│           ├── common/
│           │   ├── goalkeeperSections.ts             # MODIFIED: availability.complete rule
│           │   ├── goalkeeperRegistrationResponse.ts # MODIFIED: cityId/serviceZoneIds replace radiusKm
│           │   └── validation.ts                  # MODIFIED: validateAvailability replaced/removed (research.md §7 — DB-backed checks live in the handler, not here)
│           └── commands/
│               └── saveAvailabilitySection/
│                   ├── saveAvailabilitySectionCommand.ts      # MODIFIED: cityId/zoneIds replace radiusKm; new outcomes
│                   └── saveAvailabilitySectionCommandHandler.ts # MODIFIED: city + zone validation via new repositories
│
├── infrastructure/
│   ├── persistence/mongo/
│   │   ├── cityRepository.ts        # NEW: collection `cities`, mirrors CountryRepository (read-only)
│   │   ├── regionRepository.ts      # NEW: collection `regions`, read-only
│   │   └── zoneRepository.ts        # NEW: collection `zones`, read-only, ensureIndexes()
│   └── di.ts                     # MODIFIED: wires 3 new repositories + 2 new query handlers, updated SaveAvailabilitySectionCommandHandler deps
│
├── controllers/
│   ├── locationsController.ts    # MODIFIED: + GET /cities
│   ├── zonesController.ts        # NEW: GET / (mounted at /api/zones)
│   ├── goalkeeperController.ts   # MODIFIED: PATCH /me/availability contract change
│   ├── requests/
│   │   └── goalkeepers/
│   │       └── saveAvailabilitySectionRequest.ts  # MODIFIED: { cityId, zoneIds } zod schema, both required
│   └── apiError.ts                # unchanged, reused (extra payload for invalidZoneIds)
│
├── app.ts                        # MODIFIED: app.use('/api/zones', createZonesController(deps))
└── infrastructure/openapi/openapiSpec.ts  # MODIFIED: document the 2 new + 1 changed route

tests/
├── unit/
│   └── application/features/
│       ├── locations/
│       │   └── getCitiesQueryHandler.test.ts
│       ├── zones/
│       │   └── getZonesByCityQueryHandler.test.ts
│       └── goalkeepers/
│           └── saveAvailabilitySectionCommandHandler.test.ts  # MODIFIED
├── http/
│   └── controllers/
│       ├── locationsGetCities.test.ts
│       ├── zonesGetZones.test.ts
│       └── goalkeepersSaveAvailability.test.ts  # MODIFIED (may already exist as part of goalkeepersSaveSections.test.ts)
└── fakes/
    ├── fakeCityRepository.ts
    ├── fakeRegionRepository.ts
    └── fakeZoneRepository.ts
```

**Structure Decision**: Same single-project layout as `001`–`004` — two new feature slices (`locations/queries/getCities`, a new top-level `zones` feature) added under the existing `domain/application/infrastructure/controllers` layering, following the identical per-feature folder shape already used throughout. `City`/`Region` join the existing `locations` feature's domain area (`domain/locations/`); `Zone` gets its own `domain/zones/` since `/api/zones` is a distinct top-level controller/resource, not a sub-resource of `/api/locations` (research.md §1). No new top-level directory, test tier, or architectural pattern is introduced.

## Complexity Tracking

*No entries — Constitution Check raised no violations to justify.*
