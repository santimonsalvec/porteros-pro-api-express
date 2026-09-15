---

description: "Task list for Goalkeeper Service Zones (Zone-Based Availability)"
---

# Tasks: Goalkeeper Service Zones (Zone-Based Availability)

**Input**: Design documents from `/specs/005-goalkeeper-service-zones/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, following this repository's established convention (`specs/001`–`003`) of a test task per handler/repository/endpoint. Unit tests use hand-written fakes (no mocking library); repository tests mock the MongoDB driver's `Collection` via `tests/fakes/fakeMongoCollection.ts`; HTTP tests use `supertest` against the Express app, fake-backed — no real MongoDB calls anywhere in the automated suite.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US3); Setup, Foundational, and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

## Path Conventions

Single backend project (this repo is API-only): `src/` and `tests/` at the repository root, exactly as laid out in `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new directories this feature needs — research.md confirms zero new npm packages (existing Express/`mongodb`/`zod`/`uuid`/`pino` stack only)

- [X] T001 Create the empty directory scaffold per `plan.md`'s Project Structure: `src/domain/locations/`, `src/domain/zones/`, `src/application/features/locations/common/`, `src/application/features/locations/queries/getCities/`, `src/application/features/zones/common/`, `src/application/features/zones/queries/getZonesByCity/`, `tests/unit/application/features/zones/`
- [X] T002 [P] Confirm no `package.json`, `.env`, or `src/infrastructure/config.ts` changes are required for this feature (research.md, plan.md Constraints) — no new dependency or environment variable

**Checkpoint**: Directory structure ready; no application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reshape the `availability` section of the existing `GoalkeeperRegistration`/`GoalkeeperProfile` entities and their DTOs from `{ radiusKm }` to `{ cityId, zoneIds }` — every one of the three user stories depends on this shared shape existing first, since even reading it back (US2) requires the new fields

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Replace `AvailabilitySection { radiusKm: number | null }` with `{ cityId: string | null; zoneIds: string[] }` in `GoalkeeperRegistration` — update `createEmpty`'s defaults (`cityId: null, zoneIds: []`); `saveAvailability` keeps its existing `Partial<>`-merge-setter shape — in `src/domain/goalkeepers/goalkeeperRegistration.ts`, per `data-model.md`
- [X] T004 [P] Replace `radiusKm: number` with `cityId: string; zoneIds: string[]` in `GoalkeeperProfile`; update `createFromRegistration` to read `availability.cityId!`/`availability.zoneIds` instead of `availability.radiusKm!` — in `src/domain/goalkeepers/goalkeeperProfile.ts`, per `data-model.md` (depends on T003)
- [X] T005 [P] Update `computeGoalkeeperSections` — `availability.complete` is now `cityId !== null && zoneIds.length > 0` — in `src/application/features/goalkeepers/common/goalkeeperSections.ts` (depends on T003)
- [X] T006 [P] Update `toGoalkeeperRegistrationResponse` — replace `radiusKm: number | null` with `cityId: string | null` and `serviceZoneIds: string[]` (research.md §11 — deliberately different field name than the request's `zoneIds`) — in `src/application/features/goalkeepers/common/goalkeeperRegistrationResponse.ts` (depends on T003, T005)
- [X] T007 Update `GoalkeeperRegistrationRepository`'s `toDocument`/`fromDocument` mapping for the new `availability.cityId`/`availability.zoneIds` shape (`zoneIds` defaults to `[]` when the stored field is absent) in `src/infrastructure/persistence/mongo/goalkeeperRegistrationRepository.ts` (depends on T003)
- [X] T008 [P] Update `GoalkeeperProfileRepository`'s `toDocument`/`fromDocument` mapping — replace `radiusKm` with `cityId`/`zoneIds` — in `src/infrastructure/persistence/mongo/goalkeeperProfileRepository.ts` (depends on T004)
- [X] T009 [P] Remove the now-unused `validateAvailability`, `MIN_RADIUS_KM`, `MAX_RADIUS_KM` from `src/application/features/goalkeepers/common/validation.ts` (research.md §7 — the new save contract's DB-backed checks live in the command handler, not in this pure-validator module)

### Tests for Foundational

- [X] T010 [P] Update `tests/unit/infrastructure/persistence/mongo/goalkeeperRegistrationRepository.test.ts`'s `toDocument`/`fromDocument` round-trip assertions for `availability.cityId`/`availability.zoneIds` (depends on T007)
- [X] T011 [P] Update `tests/unit/infrastructure/persistence/mongo/goalkeeperProfileRepository.test.ts`'s mapping assertions for `cityId`/`zoneIds` (depends on T008)
- [X] T012 [P] Update `tests/unit/application/features/goalkeepers/activateGoalkeeperCommandHandler.test.ts`'s fixtures — replace `radiusKm` sample data with `cityId`/`zoneIds` wherever a registration is built as "complete" (depends on T003, T004)
- [X] T013 [P] Update `tests/http/controllers/goalkeeperActivate.test.ts` and `tests/http/controllers/goalkeeperCancel.test.ts`'s fixture payloads — replace `radiusKm` sample data with `cityId`/`zoneIds` (depends on T003)

**Checkpoint**: Foundation ready — user story implementation can now begin. Existing activation/cancellation flows still pass with the new shape.

---

## Phase 3: User Story 1 - Choose a service city and zones, and save availability (Priority: P1) 🎯 MVP

**Goal**: A goalkeeper can search for their city, preview its available service zones (transparently resolving a satellite city to its metro anchor), and save their chosen city together with one or more selected zones in a single operation — with every validation failure (nonexistent city, missing/invalid/mismatched zones) clearly rejected and nothing partially saved.

**Independent Test**: Search a city known to have configured zones, preview its zones, save a selection, and confirm (via the save response) the exact city and zones persisted; submit an invalid city, a zone from the wrong city, or zero zones and confirm each is rejected with no change.

### Domain & ports for User Story 1

- [X] T014 [P] [US1] Create the `City` entity (`id`, `name`, `regionId`, `zoneCityId: string | null`, extends `Entity<string>`) in `src/domain/locations/city.ts`, per `data-model.md`
- [X] T015 [P] [US1] Create the `Region` entity (`id`, `name`, extends `Entity<string>`) in `src/domain/locations/region.ts`, per `data-model.md`
- [X] T016 [P] [US1] Create the `Zone` entity (`id`, `cityId`, `name`, `slug`, `geometry` (opaque GeoJSON), `active`, `displayOrder`, extends `Entity<string>`) in `src/domain/zones/zone.ts`, per `data-model.md`
- [X] T017 [P] [US1] Define `ICityRepository` (`getById`, `searchByName(query, limit)`) and `IRegionRepository` (`getByIds(ids)`) — minimal, read-only, no `IRepository` extension (research.md §1) — in `src/application/features/locations/common/ports.ts` (depends on T014, T015)
- [X] T018 [P] [US1] Define `IZoneRepository` (`getActiveByCityId(anchorCityId)`, `getManyByIds(ids)`, `hasActiveZonesForCityIds(anchorCityIds): Promise<Set<string>>`) — minimal, read-only — in `src/application/features/zones/common/ports.ts` (depends on T016)
- [X] T019 [P] [US1] Implement the pure function `resolveAnchorCityId(city: City): string` (`city.zoneCityId ?? city.id`, research.md §2) in `src/application/features/locations/common/resolveAnchorCityId.ts` (depends on T014)
- [X] T020 [P] [US1] Define `GetCitiesQuery` (`q: string`) and its result (`{ cities: CityOption[] }`, `CityOption = { id, name, region, hasZones }`) in `src/application/features/locations/queries/getCities/getCitiesQuery.ts`
- [X] T021 [P] [US1] Define `GetZonesByCityQuery` (`cityId: string`) and its outcome union (`success` with `zones: ZoneOption[]` | `city_not_found` | `no_zones_configured`) in `src/application/features/zones/queries/getZonesByCity/getZonesByCityQuery.ts`
- [X] T022 [US1] Replace `SaveAvailabilitySectionCommand`'s `radiusKm?` param with required `cityId: string`, `zoneIds: string[]`; replace its outcome union with `success` | `invalid_city` | `invalid_zones` (carrying `invalidZoneIds: string[]`) | `already_active` (research.md §7, §8) in `src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.ts` (depends on T003)
- [X] T023 [P] [US1] Replace `saveAvailabilitySectionRequestSchema` with `{ cityId: z.string().trim().min(1), zoneIds: z.array(z.string().trim().min(1)).min(1) }` — both required, no partial mode (research.md §7) — in `src/controllers/requests/goalkeepers/saveAvailabilitySectionRequest.ts`

### Repositories & fakes for User Story 1

- [X] T024 [P] [US1] Implement `CityRepository` (collection `cities`, mirrors `CountryRepository`'s read-only pattern: `getById`, `searchByName` via case-insensitive regex on `name` capped at the given limit; `ensureIndexes()` creating a prefix/text index on `name` and an index on `zoneCityId`) in `src/infrastructure/persistence/mongo/cityRepository.ts` (depends on T017)
- [X] T025 [P] [US1] Implement `RegionRepository` (collection `regions`, read-only, `getByIds(ids)` via `$in`) in `src/infrastructure/persistence/mongo/regionRepository.ts` (depends on T017)
- [X] T026 [P] [US1] Implement `ZoneRepository` (collection `zones`, read-only, `getActiveByCityId` sorted by `displayOrder` asc filtered to `active: true`, `getManyByIds` via `$in`, `hasActiveZonesForCityIds` via a `distinct('cityId', { cityId: { $in: ... }, active: true })`; `ensureIndexes()` creating `{ cityId: 1, active: 1, displayOrder: 1 }`) in `src/infrastructure/persistence/mongo/zoneRepository.ts` (depends on T018)
- [X] T027 [P] [US1] Write hand-written fakes `FakeCityRepository` and `FakeRegionRepository` in `tests/fakes/fakeCityRepository.ts` and `tests/fakes/fakeRegionRepository.ts` (depends on T017)
- [X] T028 [P] [US1] Write a hand-written fake `FakeZoneRepository` in `tests/fakes/fakeZoneRepository.ts` (depends on T018)

### Tests for User Story 1

- [X] T029 [P] [US1] Unit tests for `GetCitiesQueryHandler` — empty `q` returns `[]` without querying; matches capped/mapped correctly; `hasZones` true only when the resolved anchor has ≥1 active zone, batched not per-row (research.md §5) — in `tests/unit/application/features/locations/getCitiesQueryHandler.test.ts` (depends on T027, T028)
- [X] T030 [P] [US1] Unit tests for `GetZonesByCityQueryHandler` — success returns only `active` zones sorted by `displayOrder`; a satellite city's `cityId` correctly resolves to its anchor's zones (research.md §2); `city_not_found` when the id doesn't resolve to any city — in `tests/unit/application/features/zones/getZonesByCityQueryHandler.test.ts` (depends on T027, T028)
- [X] T031 [P] [US1] Update `SaveAvailabilitySectionCommandHandler` unit tests for the new contract: success persists `cityId`/`zoneIds` and marks `availability.complete`; `invalid_city` for a nonexistent city; `invalid_zones` (with the correct `invalidZoneIds`) for a nonexistent, inactive, or wrong-anchor zone; duplicate ids in the request are deduplicated before validation/persistence (research.md §8); `already_active` guard — in `tests/unit/application/features/goalkeepers/saveAvailabilitySectionCommandHandler.test.ts` (depends on T027, T028)
- [X] T032 [P] [US1] Unit tests for `CityRepository`, `RegionRepository`, and `ZoneRepository` document mapping against `tests/fakes/fakeMongoCollection.ts` in `tests/unit/infrastructure/persistence/mongo/cityRepository.test.ts`, `regionRepository.test.ts`, `zoneRepository.test.ts` (depends on T024, T025, T026)
- [X] T033 [P] [US1] HTTP tests for `GET /api/locations/cities` per `contracts/get-cities.md` (200 with `hasZones` per result; empty `q` → `[]`; 401 no token; reachable without a complete goalkeeper profile) in `tests/http/controllers/locationsGetCities.test.ts`
- [X] T034 [P] [US1] HTTP tests for `GET /api/zones` per `contracts/get-zones.md` (200 with correct zone shape, satellite-city resolution; 404 `city_not_found`; 401 no token) in `tests/http/controllers/zonesGetZones.test.ts`
- [X] T035 [P] [US1] Update HTTP tests for `PATCH /api/goalkeepers/me/availability` per `contracts/save-availability.md` (200 success reflecting `cityId`/`serviceZoneIds`; 400 `validation_failed` for missing/empty fields; 400 `invalid_city`; 400 `invalid_zones` with `invalidZoneIds`; 409 `already_active`; 401/403 gates) in `tests/http/controllers/goalkeeperSaveSections.test.ts`

### Implementation for User Story 1

- [X] T036 [US1] Implement `GetCitiesQueryHandler` (trims `q`; short-circuits to `{ cities: [] }` when empty; searches via `ICityRepository.searchByName`; resolves anchors via `resolveAnchorCityId`; batches `hasZones` via `IZoneRepository.hasActiveZonesForCityIds`; resolves region names via `IRegionRepository.getByIds`) in `src/application/features/locations/queries/getCities/getCitiesQueryHandler.ts` (depends on T017, T019, T020, T029)
- [X] T037 [US1] Implement `GetZonesByCityQueryHandler` (looks up the city; `city_not_found` if missing; resolves the anchor; `no_zones_configured` if the anchor has zero active zones; otherwise returns them sorted) in `src/application/features/zones/queries/getZonesByCity/getZonesByCityQueryHandler.ts` (depends on T017, T018, T019, T021, T030)
- [X] T038 [US1] Rewrite `SaveAvailabilitySectionCommandHandler`: loads or lazily creates the registration via `createEmpty`; rejects if `status === 'active'`; looks up `cityId` → `invalid_city` if missing; resolves the anchor; deduplicates `zoneIds`, fetches them via `IZoneRepository.getManyByIds`, and rejects (`invalid_zones`, naming the offending ids) if any is missing, inactive, or not on the resolved anchor; otherwise merges via `saveAvailability` and persists — in `src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.ts` (depends on T017, T018, T019, T022, T031)
- [X] T039 [US1] Add `GET /cities` to `locationsController.ts` (parses `q` from the query string, dispatches `GetCitiesQuery`, returns `{ cities }}`) in `src/controllers/locationsController.ts` (depends on T036, T033)
- [X] T040 [US1] Create `zonesController.ts` — `GET /` (parses `cityId` from the query string, dispatches `GetZonesByCityQuery`, maps `success` → 200, `city_not_found`/`no_zones_configured` → 404 with the matching `error` code) — in `src/controllers/zonesController.ts` (depends on T037, T034)
- [X] T041 [US1] Update `PATCH /me/availability` in `goalkeeperController.ts`: parse the new `saveAvailabilitySectionRequestSchema`, dispatch the updated `SaveAvailabilitySectionCommand`, map `success` → 200, `invalid_city`/`invalid_zones` → 400 (the latter with `invalidZoneIds` via `ApiError`'s `extra` payload, mirroring `activateGoalkeeperCommandHandler`'s `missingSections` usage), `already_active` → 409 — in `src/controllers/goalkeeperController.ts` (depends on T023, T038, T035)
- [X] T042 [US1] Mount `zonesController` at `/api/zones` in `src/app.ts` (depends on T040)
- [X] T043 [US1] Wire `CityRepository`, `RegionRepository`, `ZoneRepository` (incl. calling `ensureIndexes()` at startup), `GetCitiesQueryHandler`, `GetZonesByCityQueryHandler`, and the rewritten `SaveAvailabilitySectionCommandHandler`'s new dependencies into the composition root in `src/infrastructure/di.ts` (depends on T024, T025, T026, T036, T037, T038, T039, T040, T042)

**Checkpoint**: User Story 1 is fully functional and independently testable — a client can search a city, preview its zones, and save a valid availability selection end to end, with every rejection path covered.

---

## Phase 4: User Story 2 - Resume a previously saved availability (Priority: P2)

**Goal**: A goalkeeper who fetches their own profile/registration data sees exactly the service city and zones they previously saved, or a clear "nothing saved yet" indication otherwise.

**Independent Test**: Seed a registration directly with `cityId`/`zoneIds` set (no dependency on User Story 1's save endpoint) and confirm `GET /api/goalkeepers/me` returns that exact city and zones; seed one with neither set and confirm it returns `cityId: null, serviceZoneIds: []`.

No new production code is required — Foundational's `toGoalkeeperRegistrationResponse` change (T006) and the already-existing `GetGoalkeeperRegistrationQueryHandler`/`GET /me` route already provide this behavior. This phase adds the explicit test coverage that verifies and locks it in.

### Tests for User Story 2

- [X] T044 [P] [US2] Add unit test cases to `tests/unit/application/features/goalkeepers/getGoalkeeperRegistrationQueryHandler.test.ts`: no registration → `cityId: null, serviceZoneIds: []`; a registration seeded directly (via the fake repository) with `cityId`/`zoneIds` set → those exact values round-trip, with `sections.availability.complete: true` (depends on T006)
- [X] T045 [US2] Add HTTP test cases to `tests/http/controllers/goalkeeperGetRegistration.test.ts` confirming `GET /api/goalkeepers/me` reflects the same not-started and previously-saved cases via the real repository stack (depends on T006)

**Checkpoint**: User Story 2 independently verified.

---

## Phase 5: User Story 3 - Handle a city with no configured zones yet (Priority: P3)

**Goal**: A goalkeeper who searches for or selects a city that has no configured service zones (directly or via its resolved anchor) is told so clearly — via `hasZones: false` in search results and a `404 no_zones_configured` on preview — rather than hitting a dead end or generic error.

**Independent Test**: Search for and preview a real, existing city seeded with zero active zones (and not linked to an anchor that has any) and confirm both `GET /api/locations/cities` marks it `hasZones: false` and `GET /api/zones` returns `404 no_zones_configured`.

The handler logic for both branches was necessarily built as part of User Story 1 (`GetCitiesQueryHandler`'s `hasZones` computation and `GetZonesByCityQueryHandler`'s `no_zones_configured` outcome can't be correctly implemented without it). This phase adds the explicit negative-path test coverage for that already-existing behavior, tracing it to its own acceptance criteria.

### Tests for User Story 3

- [X] T046 [P] [US3] Add unit test cases to `tests/unit/application/features/locations/getCitiesQueryHandler.test.ts` confirming `hasZones: false` for a city with zero active zones, both when it's its own anchor and when its anchor has zero active zones (depends on T036)
- [X] T047 [P] [US3] Add unit test cases to `tests/unit/application/features/zones/getZonesByCityQueryHandler.test.ts` confirming the `no_zones_configured` outcome for an existing city (or existing satellite city) whose resolved anchor has zero active zones (depends on T037)
- [X] T048 [US3] Add HTTP test cases to `tests/http/controllers/zonesGetZones.test.ts` confirming the `404 no_zones_configured` response shape end to end (depends on T040)

**Checkpoint**: All three user stories independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Bring the feature's documentation and full test/lint suite in line with the new contract

- [X] T049 [P] Update `src/infrastructure/openapi/openapiSpec.ts`: document `GET /api/locations/cities`, the new `GET /api/zones`, and replace every `radiusKm` reference in the `/api/goalkeepers/*` schemas/paths with `cityId`/`zoneIds`/`serviceZoneIds`
- [X] T050 Run `npm test && npm run lint` (this repository's documented Commands) and resolve any fallout across the files touched above
- [ ] T051 Manually run through `quickstart.md` against a local server with seeded `cities`/`regions`/`zones` data, confirming every example request/response matches

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories (T003's `AvailabilitySection` shape underlies every story, including US2's read-only one)
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 has no dependency on US2 or US3
  - US2 depends only on Foundational (T006) — not on US1's handler/controller work, since its independent test seeds a registration directly
  - US3 depends on US1's `GetCitiesQueryHandler`/`GetZonesByCityQueryHandler` already existing (T036, T037) — it adds test coverage for branches those handlers must already implement correctly
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependency on US2 or US3
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — independently testable via directly-seeded fixtures, without US1's endpoints
- **User Story 3 (P3)**: Requires US1's query handlers to exist first (T036, T037) — it is additional test coverage on those same handlers, not new production code

### Within Each User Story

- Domain/ports before repositories/fakes
- Repositories/fakes before tests
- Tests (written first, expected to fail) before their corresponding implementation task
- Story complete before moving to the next priority

### Parallel Opportunities

- T001–T002 (Setup) in parallel
- T003, T009 (Foundational, independent files) in parallel; T004–T008 mostly chain off T003/T004 but touch different files, so most pairs can run in parallel once their single dependency lands
- T010–T013 (Foundational tests) in parallel once their respective implementation task lands
- T014–T023 (US1 domain & ports) largely in parallel — three independent entities, two independent port files, one pure helper, two query definitions, one command definition, one zod schema
- T024–T028 (US1 repositories & fakes) in parallel once their respective port is defined
- T029–T035 (US1 tests) in parallel once their fakes/repositories exist
- T044, T046, T047 (US2/US3 test additions) in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Domain & ports, once Foundational is done:
Task: "Create the City entity in src/domain/locations/city.ts"
Task: "Create the Region entity in src/domain/locations/region.ts"
Task: "Create the Zone entity in src/domain/zones/zone.ts"

# Once entities exist:
Task: "Define ICityRepository/IRegionRepository in src/application/features/locations/common/ports.ts"
Task: "Define IZoneRepository in src/application/features/zones/common/ports.ts"

# Once ports exist:
Task: "Implement CityRepository in src/infrastructure/persistence/mongo/cityRepository.ts"
Task: "Implement RegionRepository in src/infrastructure/persistence/mongo/regionRepository.ts"
Task: "Implement ZoneRepository in src/infrastructure/persistence/mongo/zoneRepository.ts"
Task: "Write FakeCityRepository/FakeRegionRepository in tests/fakes/"
Task: "Write FakeZoneRepository in tests/fakes/fakeZoneRepository.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Search a city, preview its zones, save a selection, confirm it round-trips in the save response
5. Deploy/demo if ready — this alone delivers the entire replacement of KM-radius availability

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently (mostly locking in behavior Foundational already provided) → Deploy/Demo
4. Add User Story 3 → Test independently (locking in negative-path behavior US1 already provided) → Deploy/Demo
5. Polish: OpenAPI docs, full lint/test run, manual quickstart walkthrough

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (small — one entity/DTO reshape)
2. Once Foundational is done:
   - Developer A: User Story 1 (the bulk of the feature — new entities, repositories, two new endpoints, the save contract change)
   - Developer B: User Story 2's test coverage (small, can start as soon as Foundational lands)
   - Developer C: Prepares User Story 3's test cases against US1's contracts, ready to run the moment T036/T037 land
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no unmet dependency
- [Story] label maps task to specific user story for traceability
- US2 and US3 intentionally contain little-to-no new production code — this reflects that this feature's real complexity is concentrated in US1 (the search → preview → save journey), with US2/US3 mostly formalizing test coverage for behavior US1 and Foundational are required to get right anyway
- Verify tests fail before implementing (where a test task precedes its implementation task)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
