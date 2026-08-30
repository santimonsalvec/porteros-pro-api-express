---

description: "Task list for Cloudinary Image Storage Integration"
---

# Tasks: Cloudinary Image Storage Integration

**Input**: Design documents from `/specs/002-cloudinary-image-storage/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, following this repository's established convention (`specs/001-porteros-api-migration/tasks.md`) of a test task per handler/repository/endpoint, written before the implementation task it verifies. Unit tests use hand-written fakes (no mocking library); the repository test mocks the MongoDB driver's `Collection` via the existing `tests/fakes/fakeMongoCollection.ts`; HTTP tests use `supertest` against the Express app, fake-backed — no real Cloudinary or MongoDB calls anywhere in the automated suite.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US3); Setup, Foundational, and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

## Path Conventions

Single backend project (this repo is API-only): `src/` and `tests/` at the repository root, exactly as laid out in `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add this feature's three new dependencies and document its new environment variables

- [X] T001 Add `cloudinary`, `multer`, `file-type` to `dependencies` and `@types/multer` to `devDependencies` in `package.json`, then `npm install` (versions per `research.md`: `cloudinary` 2.x, `multer` 2.x, `file-type` 22.x)
- [X] T002 [P] Add `CLOUDINARY_URL`, `IMAGE_MAX_UPLOAD_SIZE_BYTES` to `.env.example`, matching `quickstart.md` — amended after initial implementation: Cloudinary's own dashboard issues a single `CLOUDINARY_URL` connection string (`cloudinary://<api_key>:<api_secret>@<cloud_name>`), not three separate variables; the SDK parses it itself (see T006, T007)

**Checkpoint**: New dependencies installed; no application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The entity, ports, config, and infrastructure adapters every one of the three user stories (store/retrieve/delete) depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Create the `StoredImage` entity (`static create({ id, externalId, url, format, bytes, width, height, uploadedBy }): StoredImage`, extends `Entity<string>`, no mutating methods) in `src/domain/images/storedImage.ts`, per `data-model.md`
- [X] T004 [P] Define the `IImageStorageProvider` port (`ProviderUploadResult` shape, `upload(buffer, contentType)`, `delete(externalId)`) and `IImageRepository` (extends `IRepository<StoredImage, string>`) in `src/application/features/images/common/ports.ts`, per `contracts/image-storage-provider.md`
- [X] T005 [P] Implement the `toStoredImageResponse(image: StoredImage)` projection — `{ id, url, format, bytes, width, height, createdAt }`, never `externalId`/`uploadedBy` — in `src/application/features/images/common/storedImageResponse.ts` (depends on T003)
- [X] T006 [P] Add Cloudinary + upload-size env config: `cloudinaryOptions.ts` and an `images` section on `config.ts` (`maxUploadSizeBytes` default `10485760`, `cloudinaryUrl`) in `src/infrastructure/images/cloudinaryOptions.ts` and `src/infrastructure/config.ts` — amended: a single lazy `cloudinaryUrl: () => requireEnv('CLOUDINARY_URL')` getter, not three separate cloud-name/key/secret vars (Cloudinary's dashboard issues one connection string; see research.md addendum)
- [X] T007 [P] Implement `CloudinaryImageStorageProvider` (implements `IImageStorageProvider`; `configure()` fail-fasts via `options.cloudinaryUrl()` then calls `cloudinary.config({ secure: true })`, which parses `CLOUDINARY_URL` from `process.env` itself; `upload` streams the buffer via `cloudinary.v2.uploader.upload_stream` with `{ quality: 'auto', fetch_format: 'auto' }`, mapping the response's `public_id`/`secure_url`/`format`/`bytes`/`width`/`height` to `ProviderUploadResult`; `delete` calls `uploader.destroy`; any provider error propagates unmodified) in `src/infrastructure/images/cloudinaryImageStorageProvider.ts` (depends on T004, T006)
- [X] T008 [P] Implement `ImageRepository` (extends `MongoRepository<StoredImage, string>`, collection `images`, `toDocument`/`fromDocument`) in `src/infrastructure/persistence/mongo/imageRepository.ts` (depends on T003, T004)
- [X] T009 [P] Write hand-written fakes `FakeImageStorageProvider` and `FakeImageRepository` in `tests/fakes/fakeImageStorageProvider.ts` and `tests/fakes/fakeImageRepository.ts` (depends on T004)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Store an optimized image (Priority: P1) 🎯 MVP

**Goal**: An authenticated user uploads an image; the system stores a provider-optimized copy and creates a matching management record; invalid/oversized uploads and provider failures never leave a record behind.

**Independent Test**: Upload a large, high-resolution image; confirm the stored asset is meaningfully smaller with no visible quality loss and a management record exists immediately; confirm a non-image or oversized file is rejected with no record created.

### Domain & ports for User Story 1

- [X] T010 [P] [US1] Define `StoreImageCommand` (`userId`, `buffer`, `contentType`) and its outcome union (`success` with the stored image | `storage_unavailable`) in `src/application/features/images/commands/storeImage/storeImageCommand.ts` — `invalid_image` is rejected at the controller (content-sniffed before a command is ever dispatched), so it isn't a handler outcome

### Tests for User Story 1

- [X] T011 [P] [US1] Unit tests for `StoreImageCommandHandler` — success builds and persists a `StoredImage` from the provider's response; a provider failure produces `storage_unavailable` with no repository write; a repository-write failure after a successful upload triggers a compensating `delete` at the provider before the error propagates (research.md §5) — in `tests/unit/application/features/images/storeImageCommandHandler.test.ts` (depends on T009, T010)
- [X] T012 [P] [US1] Unit tests for `ImageRepository` document mapping (`toDocument`/`fromDocument` round-trip) against `tests/fakes/fakeMongoCollection.ts` in `tests/unit/infrastructure/persistence/mongo/imageRepository.test.ts` (depends on T008)
- [X] T013 [P] [US1] HTTP tests for `POST /api/images` per `contracts/upload-image.md` — 201 with a small real JPEG fixture (`tests/fixtures/tinyImage.jpg`); missing file or non-image bytes → 400 `invalid_image`; a file larger than the configured limit → 413 `file_too_large`; a failing fake provider → 502 `storage_unavailable`; no `Authorization` header → 401 — in `tests/http/controllers/imagesUpload.test.ts`

### Implementation for User Story 1

- [X] T014 [US1] Implement `StoreImageCommandHandler` (upload via `IImageStorageProvider`, build the `StoredImage` via the existing `IIdGenerator`, persist via `IImageRepository`; on a persistence failure, best-effort `delete` the just-created provider asset before rethrowing) in `src/application/features/images/commands/storeImage/storeImageCommandHandler.ts` (depends on T003, T004, T005, T010, T011)
- [X] T015 [US1] Implement `imagesController.ts` — `multer` memory-storage middleware sized from `config.images.maxUploadSizeBytes`, a `file-type`-based content sniff of the buffer against the allowed format list (JPEG/PNG/WEBP/HEIC/HEIF) before dispatching, `requireAuth`, and the `POST /api/images` route mapping `StoreImageCommand` outcomes to 201/400/413/502 — in `src/controllers/imagesController.ts` (depends on T006, T014)
- [X] T016 [US1] Mount `imagesController` at `/api/images` in `src/app.ts`, and wire `CloudinaryImageStorageProvider`, `ImageRepository`, and `StoreImageCommandHandler` into the composition root in `src/infrastructure/di.ts` (depends on T007, T008, T014, T015, T013)

**Checkpoint**: User Story 1 is fully functional and independently testable — an authenticated user can upload an image and receive back a stored, optimized reference. This is the MVP.

---

## Phase 4: User Story 2 - Retrieve a stored image (Priority: P2)

**Goal**: Whichever caller references a stored image can resolve it to its current accessible location — but only when authenticated and authorized (uploader-only, per research.md §6, until a future feature layers its own resource-level authorization on top).

**Independent Test**: Store an image, resolve it by id as its uploader and confirm the correct location comes back; attempt the same as a different user and confirm denial; request an unknown id and confirm "not found."

### Domain & ports for User Story 2

- [X] T017 [P] [US2] Define `ResolveImageQuery` (`userId`, `imageId`) and its outcome union (`success` with the stored image | `not_found` | `forbidden`) in `src/application/features/images/queries/resolveImage/resolveImageQuery.ts`

### Tests for User Story 2

- [X] T018 [P] [US2] Unit tests for `ResolveImageQueryHandler` (success for the uploader; `not_found` for an unknown id; `forbidden` for an authenticated user who isn't the uploader) in `tests/unit/application/features/images/resolveImageQueryHandler.test.ts` (depends on T009, T017)
- [X] T019 [P] [US2] HTTP tests for `GET /api/images/:id` per `contracts/get-image.md` (200 success; 404 unknown id; 403 for a different authenticated user; 401 unauthenticated) in `tests/http/controllers/imagesGet.test.ts`

### Implementation for User Story 2

- [X] T020 [US2] Implement `ResolveImageQueryHandler` in `src/application/features/images/queries/resolveImage/resolveImageQueryHandler.ts` (depends on T004, T005, T017, T018)
- [X] T021 [US2] Add `GET /api/images/:id` to `imagesController.ts` mapping `ResolveImageQuery` outcomes to 200/404/403, and wire `ResolveImageQueryHandler` into the composition root in `src/infrastructure/di.ts` (depends on T015, T016, T020, T019)

**Checkpoint**: User Stories 1 and 2 both work independently — a stored image can be uploaded and then correctly resolved or denied.

---

## Phase 5: User Story 3 - Remove a stored image (Priority: P3)

**Goal**: The uploader can permanently delete a stored image; deletion removes both the provider asset and the management record as one consistent outcome, and a deleted image is immediately unreachable.

**Independent Test**: Store an image, delete it as its uploader, and confirm it's no longer retrievable and its record is gone; attempt to delete an image that isn't the requester's own and confirm denial; delete an already-deleted id and confirm a graceful "not found."

### Domain & ports for User Story 3

- [X] T022 [P] [US3] Define `DeleteImageCommand` (`userId`, `imageId`) and its outcome union (`success` | `not_found` | `forbidden`) in `src/application/features/images/commands/deleteImage/deleteImageCommand.ts`

### Tests for User Story 3

- [X] T023 [P] [US3] Unit tests for `DeleteImageCommandHandler` (success removes the provider asset and then the record; `not_found` for an unknown or already-deleted id; `forbidden` for a non-uploader; a provider-delete failure leaves the record in place and propagates the error, per `contracts/delete-image.md`) in `tests/unit/application/features/images/deleteImageCommandHandler.test.ts` (depends on T009, T022)
- [X] T024 [P] [US3] HTTP tests for `DELETE /api/images/:id` per `contracts/delete-image.md` (204 success; 404 unknown/already-deleted; 403 for a different uploader; 401 unauthenticated; a follow-up `GET` on the same id then returns 404) in `tests/http/controllers/imagesDelete.test.ts`

### Implementation for User Story 3

- [X] T025 [US3] Implement `DeleteImageCommandHandler` in `src/application/features/images/commands/deleteImage/deleteImageCommandHandler.ts` (depends on T004, T022, T023)
- [X] T026 [US3] Add `DELETE /api/images/:id` to `imagesController.ts` mapping `DeleteImageCommand` outcomes to 204/404/403, and wire `DeleteImageCommandHandler` into the composition root in `src/infrastructure/di.ts` (depends on T015, T016, T025, T024)

**Checkpoint**: All three user stories are independently functional — upload, retrieve, and delete each work end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final verification once all three stories are in place

- [X] T027 [P] Add the three `/api/images` endpoints (request/response shapes per `contracts/upload-image.md`, `get-image.md`, `delete-image.md`) to `src/infrastructure/openapi/openapiSpec.ts`
- [X] T028 [P] Run `npm run lint` and fix any violations across every new `images`-related file
- [ ] T029 Run the `quickstart.md` walkthrough end to end (upload, retrieve, delete, and every rejection path) against a real Cloudinary account and MongoDB instance — **requires a real `CLOUDINARY_URL`, not available in this environment; left for the user to run**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 has no dependency on US2/US3
  - US2 depends on US1 only for the shared `imagesController.ts`/`di.ts` files existing (T021 extends what T015/T016 created) — its query logic itself (T017/T018/T020) has no dependency on US1's command logic
  - US3 depends on US1 the same way (T026 extends `imagesController.ts`/`di.ts`), with no dependency on US2
- **Polish (Final Phase)**: Depends on all three user stories being complete

### Within Each User Story

- Domain/ports (Command or Query definition) before its handler
- Tests before the implementation they verify
- Handler before the controller route that dispatches it
- Controller route before mounting/wiring

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel
- T003–T009 (Foundational) can all run in parallel — seven independent files with no cross-dependency among themselves (T007/T008 each depend only on earlier foundational tasks, not on each other)
- Once Foundational completes, the three stories' *domain & ports* + *test* tasks (T010–T013, T017–T019, T022–T024) can all be drafted in parallel across stories, since each story's outcome types and tests live in their own files
- Within a story, its own test tasks marked [P] can run in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Once Foundational (T003–T009) is done, launch together:
Task: "Define StoreImageCommand and its outcome union in src/application/features/images/commands/storeImage/storeImageCommand.ts"
Task: "Unit tests for ImageRepository document mapping in tests/unit/infrastructure/persistence/mongo/imageRepository.test.ts"
Task: "HTTP tests for POST /api/images in tests/http/controllers/imagesUpload.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `npm test && npm run test:http`, then the upload portion of `quickstart.md`
5. This alone delivers real value: images can be stored, optimized, and recorded — even before retrieval/deletion exist as HTTP capabilities

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → test independently → MVP
3. User Story 2 → test independently (adds resolve-by-id, with authorization)
4. User Story 3 → test independently (adds delete)
5. Polish → OpenAPI docs, lint, full quickstart validation

---

## Notes

- [P] tasks = different files, no unmet dependency
- [Story] label maps task to specific user story for traceability
- Every user story is independently completable and testable per its own Independent Test above
- No separate task tracks `src/infrastructure/di.ts` changes in isolation — each story's controller-mount task (T016, T021, T026) folds in that story's composition-root wiring, matching this repository's existing convention (see `specs/001-porteros-api-migration/tasks.md`, which does the same)
- Avoid: vague tasks, same-file conflicts within a single parallel batch, cross-story dependencies that break independence
