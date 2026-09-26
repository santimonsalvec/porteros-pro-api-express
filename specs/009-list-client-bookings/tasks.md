---

description: "Task list for List the Client's Own Bookings (Paginated)"
---

# Tasks: List the Client's Own Bookings (Paginated)

**Input**: Design documents from `/specs/009-list-client-bookings/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/list-bookings.md, quickstart.md

**Tests**: Included, following this repository's convention (`specs/001`–`008`) of a test task per pure helper, handler, repository and endpoint.
- Unit tests use hand-written fakes (no mocking library for application code) and `FixedClock` from `tests/fakes/fakeClock.ts`.
- Repository tests mock the MongoDB driver's `Collection` via `tests/fakes/fakeMongoCollection.ts`.
- HTTP tests use `supertest` against `tests/http/testAppFactory.ts`.
- No test touches a real database (research.md §10). Index usage is checked manually in the Polish phase.

**Organization**: Tasks are grouped by user story (from spec.md).
- **Phase 2 holds everything the single handler needs**: the ports, the `pageWindow` rule, the repository reads and the fakes. The handler, controller route and wiring are complete from US1.
- **US2 and US3 add no production code.** They are verification slices that prove the isolation guarantee (US2) and multi-page behavior (US3) with dedicated tests. The request schema is written in full in US1, because the endpoint can't exist without it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US3). Setup, Foundational and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Constants and test-helper support the rest of the feature builds on.

- [X] T001 [P] Add `export const BOOKINGS_PAGE_SIZE_DEFAULT = 20;` and `export const BOOKINGS_PAGE_SIZE_MAX = 50;` with a one-line doc comment ("GET /bookings page size, spec FR-005") in `src/application/features/goalkeeperRequests/common/bookingLimits.ts`
- [X] T002 [P] Extend `toArrayCursor` in `tests/fakes/fakeMongoCollection.ts` with a chainable `skip: Mock` (returns the same cursor, like `sort`/`limit`), and add `skip` to the cursor's type annotation. Existing callers must keep working unchanged

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ports, the pure page arithmetic, the Mongo reads, the fakes and the response/query types. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add three read methods to `IBookingRepository` in `src/application/features/goalkeeperRequests/common/ports.ts`, with doc comments exactly as in data-model.md "Application ports":
  - `countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }>`
  - `findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]>` (`startsAt >= now`, ordered `startsAt ↑, _id ↑`)
  - `findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]>` (`startsAt < now`, ordered `startsAt ↓, _id ↓`)
- [X] T004 [P] Add `getByIds(ids: string[]): Promise<City[]>` to `ICityRepository` in `src/application/features/locations/common/ports.ts`, with a doc comment "Cities with those ids, in no particular order; unknown ids are simply absent" (mirrors `IRegionRepository.getByIds`)
- [X] T005 [P] Create `src/application/features/goalkeeperRequests/common/pageWindow.ts`:
  - Export `interface PageWindow { upcoming: { skip: number; limit: number } | null; past: { skip: number; limit: number } | null }`.
  - Export `function pageWindow(offset: number, pageSize: number, upcomingCount: number, pastCount: number): PageWindow`, per data-model.md "Page window":
    - `upcoming` is non-null only when `offset < U`, with `skip = offset` and `limit = min(pageSize, U − offset)`.
    - `past` has `skip = max(0, offset − U)` and `limit = pageSize − (upcoming?.limit ?? 0)`, and is non-null only when that limit is > 0 and `skip < P`.
  - Pure: no imports from infrastructure.
- [X] T006 [P] Unit-test `pageWindow` in `tests/unit/application/features/goalkeeperRequests/pageWindow.test.ts`:
  - every row of the data-model.md table (U=3/P=42 pages 1–4 at size 20; U=25/P=0 page 2; U=0/P=0)
  - page exactly at the boundary (U=20, page 2 → upcoming null, past skip 0)
  - size 1 across the boundary (U=1: page 1 upcoming only, page 2 past skip 0)
  - U=0 (past only)
- [X] T007 Implement the new reads and index in `src/infrastructure/persistence/mongo/bookingRepository.ts`:
  - In `ensureIndexes()`, add `createIndex({ clientId: 1, startsAt: 1, _id: 1 }, { name: 'client_startsAt' })`, keeping the two existing unique indexes.
  - `countForClient` runs `countDocuments({ clientId, startsAt: { $gte: now } })` and `countDocuments({ clientId, startsAt: { $lt: now } })` in `Promise.all`.
  - `findUpcomingForClient` does `find({ clientId, startsAt: { $gte: now } }).sort({ startsAt: 1, _id: 1 }).skip(skip).limit(limit).toArray()`, mapped with `bookingFromDocument`.
  - `findPastForClient` does the same with `$lt` and `.sort({ startsAt: -1, _id: -1 })`.
  - Update the class doc comment to mention the list reads (feature 009).
- [X] T008 Extend `tests/unit/infrastructure/persistence/mongo/bookingRepository.test.ts`:
  - `ensureIndexes` also creates `client_startsAt` with exactly `{ clientId: 1, startsAt: 1, _id: 1 }` and is not unique.
  - `countForClient` issues both filters with the same `now`, and returns `{ upcoming, past }` from the two mocked counts.
  - `findUpcomingForClient`/`findPastForClient` pass the exact filter, sort spec, `skip` and `limit` to the `toArrayCursor` mock, and map the documents to `Booking`s. Reuse the document fixture the existing tests use.
- [X] T009 [P] Implement `getByIds` in `src/infrastructure/persistence/mongo/cityRepository.ts`: `find({ _id: { $in: ids } })`, mapped with the existing document→`City` mapping. Return `[]` without querying when `ids` is empty
- [X] T010 [P] Extend `tests/unit/infrastructure/persistence/mongo/cityRepository.test.ts` with `getByIds`: the `$in` filter, the mapping, and that an empty `ids` skips the query
- [X] T011 [P] Implement the three methods in `tests/fakes/fakeBookingRepository.ts` with the same semantics as Mongo: filter by `clientId`, split at `startsAt >= now` / `< now`, sort upcoming by `(startsAt ↑, id ↑)` and past by `(startsAt ↓, id ↓)`, then `slice(skip, skip + limit)`
- [X] T012 [P] Implement `getByIds` in `tests/fakes/fakeCityRepository.ts` (filter seeded cities by id)
- [X] T013 [P] Add `export interface ListedBookingResponse extends BookingResponse { zoneName: string | null; cityName: string | null; }` to `src/application/features/goalkeeperRequests/common/bookingResponse.ts`, with a doc comment ("GET /bookings item: the confirmation body plus current names, contracts/list-bookings.md"). Leave `toBookingResponse` unchanged
- [X] T014 Create `src/application/features/goalkeeperRequests/queries/listClientBookings/listClientBookingsQuery.ts`:
  - `export interface ListClientBookingsResult { items: ListedBookingResponse[]; page: number; pageSize: number; totalItems: number; totalPages: number }`
  - `export class ListClientBookingsQuery extends IQuery<ListClientBookingsResult>` with `constructor(public readonly clientId: string, public readonly page: number, public readonly pageSize: number)`
  - Follow the style of `getBookingConfigQuery.ts`, with a doc comment "The caller's bookings, upcoming then past, one page at a time."

**Checkpoint**: Ports, fakes and reads are ready. `npm test` passes, and so does `tsc` (both fakes satisfy their widened ports).

---

## Phase 3: User Story 1 - A client sees the bookings they have made (Priority: P1) 🎯 MVP

**Goal**: `GET /api/goalkeeper-requests/bookings` returns the caller's bookings: upcoming first (soonest first), then past (most recent first). Each item is the 008 booking body plus current `zoneName`/`cityName`, and the response carries the page totals.

**Independent Test**: As client A with bookings tomorrow, in 10 days and 5 days ago, `GET /bookings` returns 200 with them in the order tomorrow → +10 d → −5 d. Their amounts match the confirmation, the names are current, and the totals are 3/1. A client with no bookings gets `items: []`, `totalItems: 0` and `totalPages: 0`.

### Tests for User Story 1

- [X] T015 [P] [US1] Create `tests/unit/application/features/goalkeeperRequests/listClientBookingsQueryHandler.test.ts`, using `FakeBookingRepository`, `FakeZoneRepository`, `FakeCityRepository` and `FixedClock`. Build bookings with the existing fixtures in `tests/fixtures/quoteFixtures.ts` + `Booking.fromQuote`/`Booking.rehydrate`, and vary `startsAt`. Cover:
  - Spec US1 scenario 1: upcoming ↑ then past ↓.
  - Scenario 2: past only.
  - Scenario 3: no bookings → empty, totals 0/0.
  - Scenario 4: amounts equal the stored booking even after the fake rate data changes.
  - Items equal `toBookingResponse(booking)` plus names.
  - `zoneName`/`cityName` resolved from the seeded zone/city.
  - A missing zone and a missing city give `null`, and the request still succeeds (FR-013, SC-004).
  - A renamed city shows the new name.
  - Two bookings with the same `startsAt` are ordered by id (ascending if upcoming, descending if past).
  - A booking with `startsAt === now` is listed as upcoming.
  - `clock.now()` is read once: spy on the fake or assert via a clock that changes on each call.
  - No write method of any fake is called (FR-012).

### Implementation for User Story 1

- [X] T016 [US1] Create `src/application/features/goalkeeperRequests/queries/listClientBookings/listClientBookingsQueryHandler.ts`, implementing `IQueryHandler<ListClientBookingsQuery, ListClientBookingsResult>`. The constructor takes `(bookingRepository: IBookingRepository, zoneRepository: IZoneRepository, cityRepository: ICityRepository, clock: IClock)`. In `handle`:
  1. Set `now = clock.now()` once.
  2. Call `countForClient(clientId, now)`.
  3. Set `offset = (page − 1) × pageSize` and compute `w = pageWindow(offset, pageSize, upcoming, past)`.
  4. Fetch `w.upcoming` and `w.past` in parallel when non-null, and concatenate upcoming then past.
  5. Dedupe `match.zoneId`/`match.cityId`. When the page is non-empty, run `zoneRepository.getManyByIds` and `cityRepository.getByIds` in parallel, then build id→name maps.
  6. Map each booking to `{ ...toBookingResponse(b), zoneName: zones.get(zoneId) ?? null, cityName: cities.get(cityId) ?? null }`.
  7. Return `{ items, page, pageSize, totalItems: upcoming + past, totalPages: Math.ceil(totalItems / pageSize) }`.

  Add a class doc comment referencing research.md §1/§4/§5.
- [X] T017 [P] [US1] Create `src/controllers/requests/goalkeeperRequests/listClientBookingsRequest.ts` with `listClientBookingsRequestSchema = z.object({ page, pageSize })`, where each field is `z.string().regex(/^\d+$/, 'Must be a whole number.').transform(Number).pipe(z.number().int()...)`. Rules:
  - `page`: `.min(1, 'Must be 1 or more.')`, `.optional().default('1')` (or equivalent, so the parsed type is `number`)
  - `pageSize`: `.min(1)` and `.max(BOOKINGS_PAGE_SIZE_MAX, 'Must be at most 50.')`, default `BOOKINGS_PAGE_SIZE_DEFAULT`, imported from `bookingLimits.ts` (the message is built from the constant)

  Unknown keys are stripped (plain `z.object`). Export `type ListClientBookingsRequest = z.infer<…>`. Add a doc comment noting that a repeated parameter arrives as an array and is refused (research.md §6).
- [X] T018 [US1] Add `router.get('/bookings', …)` to `src/controllers/goalkeeperRequestsController.ts`:
  - Parse `req.query` with `listClientBookingsRequestSchema`. On failure, `throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error))`.
  - Otherwise `const result = await deps.mediator.send(new ListClientBookingsQuery(req.authClaims!.sub, parsed.data.page, parsed.data.pageSize))`, then `res.status(200).json(result)`.
  - Update the router's doc comment to list `GET /bookings`.
  - The existing router-level `requireAuth`/`requireClientOnly`/`requireCompleteProfile` covers it; add no route-level middleware.
- [X] T019 [US1] Register `{ requestType: ListClientBookingsQuery, handler: new ListClientBookingsQueryHandler(bookingRepository, zoneRepository, cityRepository, clock) }` in `src/infrastructure/di.ts`, next to `ConfirmBookingCommand`. `bookingRepository.ensureIndexes()` already runs there and now creates `client_startsAt`
- [X] T020 [US1] Register the same handler in `tests/http/testAppFactory.ts` with the factory's `bookingRepository`, `zoneRepository`, `cityRepository` and `clock` fakes
- [X] T021 [US1] Create `tests/http/controllers/goalkeeperRequestsBookingsList.test.ts` (supertest, same auth helpers as `goalkeeperRequestsBookings.test.ts`). Seed bookings in the factory's `bookingRepository` and cover:
  - 200 with the exact contract shape (`items[*]` keys = 008 body keys + `zoneName`, `cityName`; top-level `page`, `pageSize`, `totalItems`, `totalPages`)
  - defaults `page=1`, `pageSize=20` echoed when omitted
  - upcoming-then-past order
  - empty list for a client without bookings

**Checkpoint**: US1 is fully functional. This is the MVP: a client sees their bookings, first page by default.

---

## Phase 4: User Story 2 - A client can never see another client's bookings (Priority: P1)

**Goal**: Prove that the list is strictly the token subject's (FR-002, FR-003, FR-004). No production change: the guarantees come from T007/T011's `clientId` filter, T017's stripping and the router middleware.

**Independent Test**: With bookings for clients A (2) and B (5), A's request, including `?clientId=B&userId=B`, returns only A's 2 bookings with `totalItems: 2`. No token → 401; a non-client or incomplete profile → 403.

### Tests for User Story 2

- [X] T022 [P] [US2] Add isolation cases to `tests/unit/application/features/goalkeeperRequests/listClientBookingsQueryHandler.test.ts`:
  - With A (2 bookings) and B (5, some sharing A's `startsAt`), A's query returns only A's, `totalItems` 2 and `totalPages` 1.
  - B's bookings never appear on any page for A.
- [X] T023 [P] [US2] Add access and isolation cases to `tests/http/controllers/goalkeeperRequestsBookingsList.test.ts`:
  - `?clientId=<B>&userId=<B>` sent by A → only A's bookings (spec US2 scenarios 1–2, SC-001).
  - No or invalid token → 401 with no body.
  - Goalkeeper-only token → 403. Client with incomplete profile → 403 (same fixtures as the `POST /bookings` tests, spec US2 scenarios 3–4).

**Checkpoint**: US1 + US2 make the endpoint safe to release.

---

## Phase 5: User Story 3 - Browsing a long booking history page by page (Priority: P2)

**Goal**: Prove multi-page behavior and input validation (FR-005, FR-006, FR-008, FR-009, SC-002, SC-006). No production change: T005, T016 and T017 implement it.

**Independent Test**: A client with 45 bookings gets 20/20/5 items on pages 1–3 at size 20 and `[]` on page 4, always with totals 45/3, and every booking appears exactly once. `pageSize=51`, `page=0` and `page=abc` → 400 naming the parameter.

### Tests for User Story 3

- [X] T024 [P] [US3] Add pagination cases to `tests/unit/application/features/goalkeeperRequests/listClientBookingsQueryHandler.test.ts`:
  - For N ∈ {0, 1, 20, 21, 45}, with a mix of upcoming and past, walk every page at sizes 1, 7, 20 and 50. The concatenated items equal the full expected order, with no duplicates or gaps, and every page reports `totalItems = N` and `totalPages = ceil(N / size)` (SC-002).
  - A page straddling the upcoming/past boundary contains the tail of upcoming then the head of past.
  - A page past the end returns `[]` with the correct totals (FR-009).
  - Spec US3 scenarios 1–3 with 45 bookings.
- [X] T025 [P] [US3] Add validation cases to `tests/http/controllers/goalkeeperRequestsBookingsList.test.ts`. Each of the following → 400 `validation_failed` with `fieldErrors.page` or `fieldErrors.pageSize` set, as appropriate:
  - `page=0`, `page=-1`, `page=abc`, `page=1.5`, `page=` (empty)
  - `pageSize=0`, `pageSize=51`, `pageSize=1e1`
  - `page=1&page=2` (repeated)

  Also: `pageSize=50` is accepted, and `page=999` returns 200 with `items: []` and real totals (spec US3 scenario 4, SC-006).

**Checkpoint**: All three user stories are independently tested.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Document `get` on the existing `'/api/goalkeeper-requests/bookings'` path in `src/infrastructure/openapi/openapiSpec.ts`:
  - bearer auth
  - query params `page` (integer ≥ 1, default 1) and `pageSize` (integer 1–50, default 20)
  - a 200 schema of `{ items: [booking + zoneName/cityName nullable], page, pageSize, totalItems, totalPages }`, reusing the POST /bookings item schema if one exists
  - 400 `validation_failed`, 401 and 403
  - a description of the upcoming-then-past order and the ignored identifiers, per contracts/list-bookings.md
- [X] T027 Run `npm test && npm run lint`, `npm run test:http` and `npm run test:architecture`, then fix any failure. In particular, the layering test must show no `mongodb` import under `src/application`
- [X] T028 Manual check against the dev cluster, per `specs/009-list-client-bookings/quickstart.md` §3–§4: walk-through steps 1–7, `getIndexes()` shows `client_startsAt`, and both `explain("executionStats")` plans are an `IXSCAN` on `client_startsAt` (forward and backward) with no `SORT` stage. Record the result in the PR description

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. T002 is needed by T008, and T001 by T017. Blocks all stories.
- **US1 (Phase 3)**: depends on Phase 2.
- **US2 (Phase 4)** and **US3 (Phase 5)**: depend on US1 (they test the handler and route US1 builds). They are independent of each other.
- **Polish (Phase 6)**: after the desired stories. T027 comes last among the code tasks.

### Within Phase 2

- T003 → T007 and T011 (implementations of the widened port)
- T004 → T009 and T012
- T007 → T008; T009 → T010; T005 → T006
- T013 → T014

### Within US1

- T015 (test first) → T016 → T018 → T019/T020 → T021
- T017 is independent of T016 and precedes T018

### Parallel Opportunities

- Phase 1: T001 ∥ T002.
- Phase 2: after T003/T004, T005–T006, T007–T008, T009–T010, T011, T012 and T013–T014 are mutually independent files.
- US1: T015 ∥ T017.
- US2 ∥ US3 once US1 is done (T022 ∥ T023 ∥ T024 ∥ T025). Note that T022/T024 share one test file and T023/T025 share another: parallel across files, sequential within a file.

---

## Parallel Example: Phase 2

```bash
# After T003 and T004:
Task: "T005 pageWindow.ts"            &  Task: "T006 pageWindow.test.ts"
Task: "T007 BookingRepository reads"  &  Task: "T009 CityRepository.getByIds"
Task: "T011 FakeBookingRepository"    &  Task: "T012 FakeCityRepository"
Task: "T013 ListedBookingResponse"    →  Task: "T014 ListClientBookingsQuery"
```

## Parallel Example: User Story 1

```bash
Task: "T015 handler unit tests"   &  Task: "T017 request schema"
# then T016 → T018 → T019 & T020 → T021
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1). **Stop and validate**: `GET /bookings` returns the client's first page with names and totals.
3. The endpoint already enforces isolation and pagination by construction. US2/US3 add the proof.

### Incremental Delivery

1. Setup + Foundational → reads ready.
2. US1 → MVP endpoint.
3. US2 → isolation proven. **Release gate**: don't ship to the app before US2 passes (P1).
4. US3 → multi-page and validation proven.
5. Polish → OpenAPI, the full test suites, manual index check.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- No task changes 008's write path (`MongoQuoteConfirmationStore`, `ConfirmBookingCommandHandler`).
- `toBookingResponse` is reused unchanged, so the list item can never drift from the confirmation body (FR-010).
- Commit after each phase checkpoint.
