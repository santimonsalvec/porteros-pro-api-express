---

description: "Task list for Become a Portero — Progressive Registration & Activation"
---

# Tasks: Become a Portero — Progressive Registration & Activation

**Input**: Design documents from `/specs/003-convertirse-portero/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, following this repository's established convention (`specs/001-porteros-api-migration/tasks.md`, `specs/002-cloudinary-image-storage/tasks.md`) of a test task per handler/repository/endpoint, written before the implementation task it verifies. Unit tests use hand-written fakes (no mocking library); repository tests mock the MongoDB driver's `Collection` via the existing `tests/fakes/fakeMongoCollection.ts`; HTTP tests use `supertest` against the Express app, fake-backed — no real MongoDB or Cloudinary calls anywhere in the automated suite.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US3); Setup, Foundational, and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

## Path Conventions

Single backend project (this repo is API-only): `src/` and `tests/` at the repository root, exactly as laid out in `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm this feature's dependency footprint and scaffold its directories — research.md §11 confirms zero new npm packages are needed (document-photo upload reuses `002`'s already-installed `multer`/`file-type` as-is)

- [X] T001 Create the empty directory scaffold per `plan.md`'s Project Structure: `src/domain/porteros/`, `src/application/features/porteros/{common,commands,queries}/`, `src/controllers/requests/porteros/`, `src/controllers/responses/porteros/`
- [X] T002 [P] Confirm no `package.json` or `.env`/`config.ts` changes are required for this feature (research.md §11, plan.md Constraints) — this feature introduces no new environment variable and reuses `IMAGE_MAX_UPLOAD_SIZE_BYTES` and the existing allowed-format list as-is

**Checkpoint**: Directory structure ready; no application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two entities, ports, shared helpers, repositories, and the auth-gated `/api/porteros` router every one of the three user stories depends on — including the "view my current registration status" read path every story's Independent Test relies on to verify its own outcome

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Create the `PorteroRegistration` entity (`static createEmpty(id, userId)`; setters `saveIdentification`, `savePhysicalData`, `saveLocation`, `saveAvailability`, `setDocumentPhoto(side, imageId)`; `sections()`, `isComplete()`, `activate()` — all simple, unconditional; extends `Entity<string>`) in `src/domain/porteros/porteroRegistration.ts`, per `data-model.md`
- [X] T004 [P] Create the `DocumentType` entity (`id`, `code`, `name`, extends `Entity<string>`) in `src/domain/porteros/documentType.ts`, per `data-model.md`
- [X] T005 [P] Define `IPorteroRegistrationRepository` (extends `IRepository<PorteroRegistration, string>`, plus `existsByDocument(documentType: string, documentNumber: string): Promise<boolean>`) and `IDocumentTypeRepository` (`getAll(): Promise<DocumentType[]>`, `findByCode(code: string): Promise<DocumentType | null>`) in `src/application/features/porteros/common/ports.ts`, per `contracts/save-section.md` and `contracts/document-types.md` (depends on T003, T004)
- [X] T006 [P] Implement the pure function `computePorteroSections(registration: PorteroRegistration): PorteroSectionsView` (research.md §9) in `src/application/features/porteros/common/porteroSections.ts` (depends on T003)
- [X] T007 [P] Implement `toPorteroRegistrationResponse(registration: PorteroRegistration | null): PorteroRegistrationResponse` — synthesizes the `not_started` shape (`status: "not_started"`, every field `null`/`false`, no DB write) when passed `null`; otherwise projects the entity, deriving `documentPhotoASubmitted`/`documentPhotoBSubmitted` from the photo ids and never including `formattedAddress` or raw photo ids — in `src/application/features/porteros/common/porteroRegistrationResponse.ts` (depends on T003, T006)
- [X] T008 [P] Implement `PorteroRegistrationRepository` (extends `MongoRepository<PorteroRegistration, string>`, collection `porteroRegistrations`, `toDocument`/`fromDocument`, `existsByDocument(...)` query, `getByUserId(userId): Promise<PorteroRegistration | null>`, `ensureIndexes()` creating a unique index on `userId` and a sparse unique compound index on `(identification.documentType, identification.documentNumber)`) in `src/infrastructure/persistence/mongo/porteroRegistrationRepository.ts` (depends on T003, T005)
- [X] T009 [P] Implement `DocumentTypeRepository` (mirrors `countryRepository.ts`'s read-only pattern exactly: `getAll`, `findByCode`, `add`/`update`/`delete` throw) in `src/infrastructure/persistence/mongo/documentTypeRepository.ts`, collection `documentTypes` (depends on T004, T005)
- [X] T010 [P] Write hand-written fakes `FakePorteroRegistrationRepository` and `FakeDocumentTypeRepository` in `tests/fakes/fakePorteroRegistrationRepository.ts` and `tests/fakes/fakeDocumentTypeRepository.ts` (depends on T005)
- [X] T011 [P] Define `GetPorteroRegistrationQuery` (`userId`) and its result (`{ registration: PorteroRegistrationResponse }`, always succeeds) in `src/application/features/porteros/queries/getPorteroRegistration/getPorteroRegistrationQuery.ts` (depends on T007)
- [X] T012 [P] Define `GetDocumentTypesQuery` (no params) and its result (`{ documentTypes: { code, name }[] }`) in `src/application/features/porteros/queries/getDocumentTypes/getDocumentTypesQuery.ts`

### Tests for Foundational

- [X] T013 [P] Unit tests for `GetPorteroRegistrationQueryHandler` — no stored document → `not_started` with every field null/false, no repository write; a stored document → correct field values and computed `sections` — in `tests/unit/application/features/porteros/getPorteroRegistrationQueryHandler.test.ts` (depends on T010, T011)
- [X] T014 [P] Unit tests for `GetDocumentTypesQueryHandler` (returns every seeded `DocumentType`) in `tests/unit/application/features/porteros/getDocumentTypesQueryHandler.test.ts` (depends on T010, T012)
- [X] T015 [P] Unit tests for `PorteroRegistrationRepository` document mapping (`toDocument`/`fromDocument` round-trip) and `existsByDocument` against `tests/fakes/fakeMongoCollection.ts` in `tests/unit/infrastructure/persistence/mongo/porteroRegistrationRepository.test.ts` (depends on T008)
- [X] T016 [P] Unit tests for `DocumentTypeRepository` document mapping (`getAll`, `findByCode`; `add`/`update`/`delete` throw) in `tests/unit/infrastructure/persistence/mongo/documentTypeRepository.test.ts` (depends on T009)
- [X] T017 [P] HTTP tests for `GET /api/porteros/me` per `contracts/get-registration.md` (200 `not_started` for a fresh client; 401 no token; 403 admin account or incomplete client profile) in `tests/http/controllers/porterosGetRegistration.test.ts`
- [X] T018 [P] HTTP tests for `GET /api/porteros/document-types` per `contracts/document-types.md` (200, reachable with no `Authorization` header) in `tests/http/controllers/porterosDocumentTypes.test.ts`

### Implementation for Foundational

- [X] T019 Implement `GetPorteroRegistrationQueryHandler` in `src/application/features/porteros/queries/getPorteroRegistration/getPorteroRegistrationQueryHandler.ts` (depends on T005, T007, T011, T013)
- [X] T020 Implement `GetDocumentTypesQueryHandler` in `src/application/features/porteros/queries/getDocumentTypes/getDocumentTypesQueryHandler.ts` (depends on T005, T012, T014)
- [X] T021 Implement `porterosController.ts` skeleton — a router with `requireAuth`, `requireClientOnly`, `requireCompleteProfile` applied to every `/me/*` route (research.md §6), plus `GET /me` (mapping `GetPorteroRegistrationQuery`) and an unauthenticated `GET /document-types` route (mirrors `locationsController.ts`, mapping `GetDocumentTypesQuery`) — in `src/controllers/porterosController.ts` (depends on T019, T020, T017, T018)
- [X] T022 Mount `porterosController` at `/api/porteros` in `src/app.ts`; wire `PorteroRegistrationRepository` (incl. calling `ensureIndexes()` at startup, mirroring `userRepository.ensureIndexes()`), `DocumentTypeRepository`, `GetPorteroRegistrationQueryHandler`, and `GetDocumentTypesQueryHandler` into the composition root in `src/infrastructure/di.ts` (depends on T008, T009, T019, T020, T021)

**Checkpoint**: Foundation ready — user story implementation can now begin. `GET /api/porteros/me` and `GET /api/porteros/document-types` already work end to end.

---

## Phase 3: User Story 1 - Save registration progress one section at a time (Priority: P1) 🎯 MVP

**Goal**: A client can save any one of the four sections independently — including replacing an identification document photo — without needing any other section started, with every field validated and every rejection clearly explained.

**Independent Test**: Save data for exactly one section, confirm (via `GET /api/porteros/me`) that section's data and completion state are correct while the other three remain untouched; submit invalid data and confirm a field-specific rejection with no section marked complete; upload a document photo twice for the same side and confirm only the latest is retained.

### Domain & ports for User Story 1

- [X] T023 [P] [US1] Define `SaveIdentificationSectionCommand` (`userId`, `documentType?`, `documentNumber?`, `issueDate?`, `birthDate?`) and its outcome union (`success` with the updated registration | `validation_failed` with `fieldErrors` | `invalid_document_type` | `duplicate_document` | `already_active`) in `src/application/features/porteros/commands/saveIdentificationSection/saveIdentificationSectionCommand.ts`
- [X] T024 [P] [US1] Define `SavePhysicalDataSectionCommand` (`userId`, `heightCm?`, `weightKg?`) and its outcome union (`success` | `validation_failed` | `already_active`) in `src/application/features/porteros/commands/savePhysicalDataSection/savePhysicalDataSectionCommand.ts`
- [X] T025 [P] [US1] Define `SaveLocationSectionCommand` (`userId`, `latitude?`, `longitude?`, `city?`, `state?`, `country?`, `neighborhood?`, `formattedAddress?`) and its outcome union (`success` | `validation_failed` | `already_active`) in `src/application/features/porteros/commands/saveLocationSection/saveLocationSectionCommand.ts`
- [X] T026 [P] [US1] Define `SaveAvailabilitySectionCommand` (`userId`, `radiusKm?`) and its outcome union (`success` | `validation_failed` | `already_active`) in `src/application/features/porteros/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.ts`
- [X] T027 [P] [US1] Define `SaveDocumentPhotoCommand` (`userId`, `side: 'A' | 'B'`, `buffer`, `contentType`) and its outcome union (`success` with the updated registration | `storage_unavailable` | `already_active`) in `src/application/features/porteros/commands/saveDocumentPhoto/saveDocumentPhotoCommand.ts`
- [X] T028 [P] [US1] Implement shared field validators in `src/application/features/porteros/common/validation.ts`: `validateIdentificationFields` (`documentNumber` non-empty after trim; `birthDate`/`issueDate` valid ISO dates, not in the future; `birthDate` implies age ≥ 18; `issueDate` not before the *effective* `birthDate` — whichever of this request's or the previously stored value applies); `validatePhysicalData` (`heightCm` 120–230, `weightKg` 40–150); `validateLocation` (`latitude` -90..90, `longitude` -180..180, `city`/`state`/`country` non-empty after trim); `validateAvailability` (`radiusKm` integer, 10–50) — each returns a `Record<string, string>` of field errors, matching `validateNameAndWhatsApp`'s shape

### Test fakes for User Story 1

- [X] T029 [P] [US1] Write a hand-written `FakeSender` implementing `ISender` (records every dispatched request and returns a pre-configured stub result per request type) in `tests/fakes/fakeSender.ts` — needed because `SaveDocumentPhotoCommandHandler` and `CancelPorteroRegistrationCommandHandler` (US3) compose `002`'s `StoreImageCommand`/`DeleteImageCommand` through the mediator (research.md §5) rather than depending on image ports directly

### Tests for User Story 1

- [X] T030 [P] [US1] Unit tests for `SaveIdentificationSectionCommandHandler` — partial merge (only provided fields validated/changed); `validation_failed` with correct `fieldErrors`; `invalid_document_type` via a fake `DocumentTypeRepository` miss; `duplicate_document` via `existsByDocument` returning `true` only once both `documentType` and `documentNumber` are known (whether from this request or a prior save); cross-field rejection when a newly saved `issueDate` predates an already-stored `birthDate`; `already_active` guard — in `tests/unit/application/features/porteros/saveIdentificationSectionCommandHandler.test.ts` (depends on T010, T023, T028)
- [X] T031 [P] [US1] Unit tests for `SavePhysicalDataSectionCommandHandler` (partial merge; range validation; `already_active` guard) in `tests/unit/application/features/porteros/savePhysicalDataSectionCommandHandler.test.ts` (depends on T010, T024, T028)
- [X] T032 [P] [US1] Unit tests for `SaveLocationSectionCommandHandler` (partial merge; range/non-empty validation; `formattedAddress` accepted and stored but never echoed back in the response DTO; `already_active` guard) in `tests/unit/application/features/porteros/saveLocationSectionCommandHandler.test.ts` (depends on T010, T025, T028)
- [X] T033 [P] [US1] Unit tests for `SaveAvailabilitySectionCommandHandler` (integer + range validation; `already_active` guard) in `tests/unit/application/features/porteros/saveAvailabilitySectionCommandHandler.test.ts` (depends on T010, T026, T028)
- [X] T034 [P] [US1] Unit tests for `SaveDocumentPhotoCommandHandler` — dispatches `StoreImageCommand` via the fake sender and sets the returned id on the correct side; when that side already had a photo, dispatches `DeleteImageCommand` for the old id only *after* the new upload succeeds (research.md §5); `storage_unavailable` passthrough when the store fails, with no photo id changed; `already_active` guard — in `tests/unit/application/features/porteros/saveDocumentPhotoCommandHandler.test.ts` (depends on T010, T027, T029)
- [X] T035 [P] [US1] HTTP tests for `PATCH /api/porteros/me/identification`, `/physical-data`, `/location`, `/availability` per `contracts/save-section.md` (200 success reflecting the merge; 400 `validation_failed`; 400 `invalid_document_type`; 409 `duplicate_document`; 409 `already_active`; 401/403 gates) in `tests/http/controllers/porterosSaveSections.test.ts`
- [X] T036 [P] [US1] HTTP tests for `POST /api/porteros/me/document-photo` per `contracts/save-document-photo.md` (200 with `.attach()` for `sideA`/`sideB` independently and together; replace semantics across two sequential uploads for the same side; 400 no file / non-image content; 413 oversized; 502 storage failure; 409 `already_active`) in `tests/http/controllers/porterosDocumentPhoto.test.ts`

### Implementation for User Story 1

- [X] T037 [US1] Implement `SaveIdentificationSectionCommandHandler` (loads or lazily creates the registration via `createEmpty`; rejects if `status === 'active'`; validates via `validateIdentificationFields`; resolves `documentType` via `IDocumentTypeRepository.findByCode`; checks `existsByDocument` once both document fields are known; merges via `saveIdentification`; persists) in `src/application/features/porteros/commands/saveIdentificationSection/saveIdentificationSectionCommandHandler.ts` (depends on T003, T005, T007, T023, T028, T030)
- [X] T038 [US1] Implement `SavePhysicalDataSectionCommandHandler` in `src/application/features/porteros/commands/savePhysicalDataSection/savePhysicalDataSectionCommandHandler.ts` (depends on T003, T005, T007, T024, T028, T031)
- [X] T039 [US1] Implement `SaveLocationSectionCommandHandler` in `src/application/features/porteros/commands/saveLocationSection/saveLocationSectionCommandHandler.ts` (depends on T003, T005, T007, T025, T028, T032)
- [X] T040 [US1] Implement `SaveAvailabilitySectionCommandHandler` in `src/application/features/porteros/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.ts` (depends on T003, T005, T007, T026, T028, T033)
- [X] T041 [US1] Implement `SaveDocumentPhotoCommandHandler` (depends only on `ISender` and `IPorteroRegistrationRepository`, per research.md §5) in `src/application/features/porteros/commands/saveDocumentPhoto/saveDocumentPhotoCommandHandler.ts` (depends on T003, T005, T007, T027, T034)
- [X] T042 [US1] zod request schemas, every field optional, for the four `PATCH` bodies in `src/controllers/requests/porteros/saveIdentificationSectionRequest.ts`, `savePhysicalDataSectionRequest.ts`, `saveLocationSectionRequest.ts`, `saveAvailabilitySectionRequest.ts`
- [X] T043 [US1] Extend `porterosController.ts`: add `PATCH /me/identification`, `/me/physical-data`, `/me/location`, `/me/availability` (parsing each request schema, dispatching the matching command, mapping outcomes to 200/400/409) and `POST /me/document-photo` (`multer` memory upload for up to two fields `sideA`/`sideB`, `file-type` content-sniffing per file exactly like `imagesController.ts`, dispatching a `SaveDocumentPhotoCommand` per accepted file, merging any per-side validation errors into one response) in `src/controllers/porterosController.ts` (depends on T021, T037, T038, T039, T040, T041, T042, T035, T036)
- [X] T044 [US1] Wire the five new command handlers into the composition root — including passing the `Mediator` itself as `ISender` into `SaveDocumentPhotoCommandHandler` — in `src/infrastructure/di.ts` (depends on T022, T037, T038, T039, T040, T041, T043)

**Checkpoint**: User Story 1 is fully functional and independently testable — a client can progressively save any section, in any order, across any number of requests, and replace document photos safely.

---

## Phase 4: User Story 2 - Activate portero profile once all sections are complete (Priority: P2)

**Goal**: Once all four sections are complete, a client can activate their portero profile; the source registration is read, a permanent `PorteroProfile` is created from it, and the registration is locked. Activation is refused, with the exact missing sections named, when anything is incomplete.

**Independent Test**: Complete all four sections for a client (via User Story 1's endpoints), activate, and confirm (via `GET /api/porteros/me`) `status: "active"`; attempt activation with a section missing and confirm a `409` naming exactly that section; attempt activation a second time and confirm `already_active`.

### Domain & ports for User Story 2

- [X] T045 [P] [US2] Create the `PorteroProfile` entity (`static createFromRegistration(id, registration: PorteroRegistration): PorteroProfile`, no mutating methods, extends `Entity<string>`) in `src/domain/porteros/porteroProfile.ts`, per `data-model.md`
- [X] T046 [P] [US2] Extend `src/application/features/porteros/common/ports.ts`: add `IPorteroProfileRepository` (extends `IRepository<PorteroProfile, string>`) (depends on T045, T005)
- [X] T047 [P] [US2] Implement `PorteroProfileRepository` (extends `MongoRepository<PorteroProfile, string>`, collection `porteroProfiles`, `toDocument`/`fromDocument`, `ensureIndexes()` creating a unique index on `userId`) in `src/infrastructure/persistence/mongo/porteroProfileRepository.ts` (depends on T045, T046)
- [X] T048 [P] [US2] Write a hand-written fake `FakePorteroProfileRepository` in `tests/fakes/fakePorteroProfileRepository.ts` (depends on T046)
- [X] T049 [P] [US2] Define `ActivatePorteroCommand` (`userId`) and its outcome union (`success` with the updated registration | `incomplete` with `missingSections: string[]` | `already_active`) in `src/application/features/porteros/commands/activatePortero/activatePorteroCommand.ts`

### Tests for User Story 2

- [X] T050 [P] [US2] Unit tests for `ActivatePorteroCommandHandler` — `incomplete` lists exactly the sections whose `complete` is `false` (including all four when nothing was ever saved); success creates a `PorteroProfile` via `createFromRegistration`, flips the registration's `status` to `active` and sets `activatedAt`; `already_active` guard on a second attempt — in `tests/unit/application/features/porteros/activatePorteroCommandHandler.test.ts` (depends on T010, T048, T049)
- [X] T051 [P] [US2] Unit tests for `PorteroProfileRepository` document mapping (`toDocument`/`fromDocument` round-trip) against `tests/fakes/fakeMongoCollection.ts` in `tests/unit/infrastructure/persistence/mongo/porteroProfileRepository.test.ts` (depends on T047)
- [X] T052 [P] [US2] HTTP tests for `POST /api/porteros/me/activate` per `contracts/activate.md` (200 success with `status: "active"`; 409 `portero_profile_incomplete` with `missingSections`; 409 `already_active`; 401/403 gates) in `tests/http/controllers/porterosActivate.test.ts`

### Implementation for User Story 2

- [X] T053 [US2] Implement `ActivatePorteroCommandHandler` (loads the registration; rejects `not found`/incomplete registrations by computing `missingSections` from `computePorteroSections`; rejects if already `active`; on success, builds and persists a `PorteroProfile`, then calls `registration.activate()` and persists the update) in `src/application/features/porteros/commands/activatePortero/activatePorteroCommandHandler.ts` (depends on T003, T006, T045, T049, T050)
- [X] T054 [US2] Extend `porterosController.ts`: add `POST /me/activate` mapping outcomes to 200/409 in `src/controllers/porterosController.ts` (depends on T043, T053, T052)
- [X] T055 [US2] Wire `PorteroProfileRepository` (incl. `ensureIndexes()`) and `ActivatePorteroCommandHandler` into the composition root in `src/infrastructure/di.ts` (depends on T044, T047, T053, T054)

**Checkpoint**: User Stories 1 and 2 both work independently — a client can complete registration and activate, becoming a portero.

---

## Phase 5: User Story 3 - Cancel an in-progress registration (Priority: P3)

**Goal**: A client with an in-progress (not yet active) registration can permanently discard it — all saved section data and any uploaded document photos — resetting to `not_started`. Refused once the profile is active.

**Independent Test**: Save data and a document photo in one or more sections, cancel, and confirm (via `GET /api/porteros/me`) `status: "not_started"` with no trace of the discarded data, and confirm the discarded photo is no longer retrievable; attempt to cancel an already-active profile and confirm refusal.

### Domain & ports for User Story 3

- [X] T056 [P] [US3] Define `CancelPorteroRegistrationCommand` (`userId`) and its outcome union (`success` with the reset registration | `already_active`) in `src/application/features/porteros/commands/cancelPorteroRegistration/cancelPorteroRegistrationCommand.ts`

### Tests for User Story 3

- [X] T057 [P] [US3] Unit tests for `CancelPorteroRegistrationCommandHandler` — dispatches `DeleteImageCommand` via the fake sender for each side that has a photo before deleting the registration; a graceful `success` (same `not_started` shape) when no registration exists at all; `already_active` guard — in `tests/unit/application/features/porteros/cancelPorteroRegistrationCommandHandler.test.ts` (depends on T010, T029, T056)
- [X] T058 [P] [US3] HTTP tests for `POST /api/porteros/me/cancel` per `contracts/cancel.md` (200 reset to `not_started`, including the no-op case when nothing was ever saved; 409 `already_active`; a follow-up `GET /me` confirms the reset; 401/403 gates) in `tests/http/controllers/porterosCancel.test.ts`

### Implementation for User Story 3

- [X] T059 [US3] Implement `CancelPorteroRegistrationCommandHandler` (loads the registration — a missing one is treated as already `not_started`, success no-op; rejects if `status === 'active'`; sends `DeleteImageCommand` for each present document photo id; deletes the registration document) in `src/application/features/porteros/commands/cancelPorteroRegistration/cancelPorteroRegistrationCommandHandler.ts` (depends on T003, T056, T057)
- [X] T060 [US3] Extend `porterosController.ts`: add `POST /me/cancel` mapping outcomes to 200/409 in `src/controllers/porterosController.ts` (depends on T054, T059, T058)
- [X] T061 [US3] Wire `CancelPorteroRegistrationCommandHandler` into the composition root in `src/infrastructure/di.ts` (depends on T055, T059, T060)

**Checkpoint**: All three user stories are independently functional — progressive save, activation, and cancellation each work end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final verification once all three stories are in place

- [X] T062 [P] Add all nine `/api/porteros` endpoints (request/response shapes per every file in `contracts/`) to `src/infrastructure/openapi/openapiSpec.ts`
- [X] T063 [P] Run `npm run lint` and fix any violations across every new `porteros`-related file
- [ ] T064 Run the `quickstart.md` walkthrough end to end (progressive save across all four sections, document photo replace, activation, the already-active rejection path, and cancellation on a separate fresh client) against a real MongoDB instance, after manually seeding the `documentTypes` collection per `data-model.md` — **requires a real MongoDB/Cloudinary environment, not available in this environment; left for the user to run**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 has no dependency on US2/US3
  - US2 depends on US1 only for the shared `porterosController.ts`/`di.ts` files existing (T054/T055 extend what T043/T044 created) — `ActivatePorteroCommandHandler`'s own logic (T049/T050/T053) only depends on Foundational (the entity, `computePorteroSections`, the repository)
  - US3 depends on US1 the same way (T060/T061 extend `porterosController.ts`/`di.ts`) and reuses US1's `FakeSender` (T029) — no dependency on US2
- **Polish (Final Phase)**: Depends on all three user stories being complete

### Within Each User Story

- Domain/ports (Command definition) before its handler
- Tests before the implementation they verify
- Handler before the controller route that dispatches it
- Controller route before mounting/wiring

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel
- T003–T012 (Foundational domain/ports/queries) can all run in parallel — ten independent-enough files (T005–T009 each depend only on T003/T004, not on each other)
- T013–T018 (Foundational tests) can all run in parallel once their respective dependencies (T010/T011/T012, T008, T009) exist
- Once Foundational completes, US1's command/port definitions and validators (T023–T028) can all be drafted in parallel; US2's T045/T046/T049 and US3's T056 can also be drafted in parallel with US1's, since none of them depend on US1's handler implementations — only the later controller-wiring tasks (T054, T060) have a real file-level dependency on US1's T043
- Within a story, its own test tasks marked [P] can run in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Once Foundational (T003–T022) is done, launch together:
Task: "Define SaveIdentificationSectionCommand in src/application/features/porteros/commands/saveIdentificationSection/saveIdentificationSectionCommand.ts"
Task: "Define SaveDocumentPhotoCommand in src/application/features/porteros/commands/saveDocumentPhoto/saveDocumentPhotoCommand.ts"
Task: "Write FakeSender in tests/fakes/fakeSender.ts"
Task: "HTTP tests for the four PATCH section endpoints in tests/http/controllers/porterosSaveSections.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `npm test && npm run test:http`, then the progressive-save portion of `quickstart.md`
5. This alone delivers real value: a client can save every section of their portero registration and see it persist across sessions — even before activation or cancellation exist as HTTP capabilities

### Incremental Delivery

1. Setup + Foundational → foundation ready (`GET /me` and the document-types catalog already work)
2. User Story 1 → test independently → MVP (progressive save, incl. document photos)
3. User Story 2 → test independently (adds activation and the permanent `PorteroProfile`)
4. User Story 3 → test independently (adds cancellation)
5. Polish → OpenAPI docs, lint, full quickstart validation

---

## Notes

- [P] tasks = different files, no unmet dependency
- [Story] label maps task to specific user story for traceability
- Every user story is independently completable and testable per its own Independent Test above
- No separate task tracks `src/infrastructure/di.ts` changes in isolation — each story's controller-mount task (T044, T055, T061) folds in that story's composition-root wiring, matching this repository's existing convention (see `specs/002-cloudinary-image-storage/tasks.md`, which does the same)
- `FakeSender` (T029) is introduced in US1 (needed by `SaveDocumentPhotoCommandHandler`) and reused as-is by US3's `CancelPorteroRegistrationCommandHandler` tests — no duplicate fake is created
- Avoid: vague tasks, same-file conflicts within a single parallel batch, cross-story dependencies that break independence
