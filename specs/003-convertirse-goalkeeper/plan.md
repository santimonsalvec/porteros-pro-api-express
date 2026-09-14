# Implementation Plan: Become a Goalkeeper — Progressive Registration & Activation

**Branch**: `003-convertirse-goalkeeper` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-convertirse-goalkeeper/spec.md`

## Summary

Add a self-service, progressive "become a goalkeeper" registration flow on top of the existing client account: a new `GoalkeeperRegistration` (draft, one per client, `goalkeeperRegistrations` collection) that clients fill in one of four independent sections at a time — identification (including two document photos, reusing feature `002`'s image-storage commands via the mediator), physical data, location, and availability — with each section independently validated and merged, never requiring the others to be started first. Activation reads a fully-complete registration and creates a separate, permanent `GoalkeeperProfile` (`goalkeeperProfiles` collection) while permanently locking the source registration as a historical record (per `/speckit.clarify`); cancellation is only possible before activation and discards the registration and its document photos entirely. No JWT/token changes are introduced — every "is this already active" gate is a live database check inside the relevant command handler, mirroring `CompleteProfileCommandHandler`'s existing `already_complete` pattern. A small new read-only reference collection, `documentTypes`, mirrors the existing `Countries` pattern for the fixed, manually-seeded set of accepted identification document types.

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) plus the already-installed `multer`/`file-type` (feature `002`) reused as-is for the document-photo upload endpoint's own content-sniffing — no new npm dependency is introduced by this feature.
**Storage**: MongoDB — three new collections: `goalkeeperRegistrations` (one `GoalkeeperRegistration` document per client, the temporary/draft record), `goalkeeperProfiles` (one `GoalkeeperProfile` document per activated goalkeeper, the permanent record), and `documentTypes` (small, manually-seeded reference data mirroring the pre-existing `Countries` collection). See data-model.md.
**Testing**: Vitest, same three-tier convention as `001`/`002`: handler-level unit tests against hand-written fakes/mocked repositories for every new command/query handler; a repository-layer unit test per new Mongo repository against a mocked `Collection`; `supertest` HTTP tests against the new `/api/goalkeepers/*` router, including multipart document-photo upload via `.attach()`.
**Target Platform**: Linux server (same containerized Node.js process as the rest of this backend).
**Project Type**: Single backend web-service project (this repository is API-only).
**Performance Goals**: No new throughput target beyond this backend's existing baseline; section saves and activation are simple single-document reads/writes, well within the existing request-latency profile.
**Constraints**: Document photos reuse `IMAGE_MAX_UPLOAD_SIZE_BYTES` and the JPEG/PNG/WEBP/HEIC/HEIF allow-list as-is (`/speckit.clarify` Q4) — no goalkeeper-specific override, no new env var. Minimum age 18 (`/speckit.clarify` Q1, FR-011). Document type + number uniqueness enforced across all in-progress and active registrations (`/speckit.clarify` Q2, FR-023). No section can be modified, and cancellation is refused, once `status === 'active'` (`/speckit.clarify` Q3, FR-024, FR-021) — enforced by a live database check in every handler, not a JWT claim (research.md §4). The locked registration is retained after activation, never deleted (`/speckit.clarify` Q5, FR-026).
**Scale/Scope**: Eight new routes under one new controller/router (`/api/goalkeepers/...`), seven new mediator commands/queries, three new Mongo collections, zero changes to existing features' code paths (`clientsController`, `imagesController`, JWT issuance, and `requireAuth`/`requireClientOnly`/`requireCompleteProfile` middleware are all reused unmodified).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no project-specific principles have been ratified, so there are no concrete gates to evaluate against. In their absence, this plan self-applies the same discipline `001` and `002` already established and this codebase consistently exercises: every new capability sits behind the existing `IRepository<TEntity, TId>` abstraction (no bespoke persistence interface for `GoalkeeperRegistration`/`GoalkeeperProfile`/`DocumentType`); document-photo storage is not reimplemented — it's composed from `002`'s existing `StoreImageCommand`/`DeleteImageCommand` through the mediator, so this plan adds zero new dependency on Cloudinary/`multer`/`file-type` internals; entity methods stay simple, unconditional setters with handlers enforcing preconditions (mirrors `User.completeProfile`); and no capability is added beyond what spec.md's FR-001–FR-026 actually require (in particular, no active-profile-management or goalkeeper-search capability is built, both explicitly out of scope per spec Assumptions). No violations to justify; no entries needed in Complexity Tracking.

*Post-Phase-1 re-check*: Unchanged — Phase 1 design (data-model.md, contracts/, quickstart.md) introduces exactly three new entities (`GoalkeeperRegistration`, `GoalkeeperProfile`, `DocumentType`), three new Mongo collections, and no capability beyond what Phase 0 scoped. Gate still passes.

## Project Structure

### Documentation (this feature)

```text
specs/003-convertirse-goalkeeper/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md         # Phase 1 output (/speckit.plan command)
├── quickstart.md         # Phase 1 output (/speckit.plan command)
├── contracts/            # Phase 1 output (/speckit.plan command)
│   ├── get-registration.md
│   ├── save-section.md
│   ├── save-document-photo.md
│   ├── activate.md
│   ├── cancel.md
│   └── document-types.md
└── tasks.md              # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── goalkeepers/
│       ├── goalkeeperRegistration.ts         # GoalkeeperRegistration entity (extends Entity<string>)
│       ├── goalkeeperProfile.ts              # GoalkeeperProfile entity
│       └── documentType.ts                # DocumentType entity (reference data)
│
├── application/
│   └── features/
│       └── goalkeepers/
│           ├── common/
│           │   ├── ports.ts                       # IGoalkeeperRegistrationRepository, IGoalkeeperProfileRepository,
│           │   │                                   # IDocumentTypeRepository (all extend/mirror IRepository)
│           │   ├── goalkeeperSections.ts             # computeGoalkeeperSections(registration): GoalkeeperSectionsView (research.md §9)
│           │   ├── goalkeeperRegistrationResponse.ts # toGoalkeeperRegistrationResponse(registration): DTO (data-model.md)
│           │   └── validation.ts                  # field-level validators shared by the four save handlers
│           ├── commands/
│           │   ├── saveIdentificationSection/
│           │   │   ├── saveIdentificationSectionCommand.ts
│           │   │   └── saveIdentificationSectionCommandHandler.ts   # incl. duplicate-document + document-type lookup
│           │   ├── savePhysicalDataSection/
│           │   │   ├── savePhysicalDataSectionCommand.ts
│           │   │   └── savePhysicalDataSectionCommandHandler.ts
│           │   ├── saveLocationSection/
│           │   │   ├── saveLocationSectionCommand.ts
│           │   │   └── saveLocationSectionCommandHandler.ts
│           │   ├── saveAvailabilitySection/
│           │   │   ├── saveAvailabilitySectionCommand.ts
│           │   │   └── saveAvailabilitySectionCommandHandler.ts
│           │   ├── saveDocumentPhoto/
│           │   │   ├── saveDocumentPhotoCommand.ts
│           │   │   └── saveDocumentPhotoCommandHandler.ts           # composes StoreImageCommand/DeleteImageCommand via ISender
│           │   ├── activateGoalkeeper/
│           │   │   ├── activateGoalkeeperCommand.ts
│           │   │   └── activateGoalkeeperCommandHandler.ts             # creates GoalkeeperProfile, locks the GoalkeeperRegistration
│           │   └── cancelGoalkeeperRegistration/
│           │       ├── cancelGoalkeeperRegistrationCommand.ts
│           │       └── cancelGoalkeeperRegistrationCommandHandler.ts   # deletes photos via DeleteImageCommand, then the registration
│           └── queries/
│               ├── getGoalkeeperRegistration/
│               │   ├── getGoalkeeperRegistrationQuery.ts
│               │   └── getGoalkeeperRegistrationQueryHandler.ts        # synthesizes not_started when no document exists
│               └── getDocumentTypes/
│                   ├── getDocumentTypesQuery.ts
│                   └── getDocumentTypesQueryHandler.ts
│
├── infrastructure/
│   ├── persistence/mongo/
│   │   ├── goalkeeperRegistrationRepository.ts   # extends MongoRepository<GoalkeeperRegistration,string>,
│   │   │                                      # collection `goalkeeperRegistrations`, + existsByDocument(...)
│   │   ├── goalkeeperProfileRepository.ts        # extends MongoRepository<GoalkeeperProfile,string>, collection `goalkeeperProfiles`
│   │   └── documentTypeRepository.ts          # plain read-only repository, collection `documentTypes` (mirrors countryRepository.ts)
│   └── di.ts                                  # extended: wires the 3 new repositories + 7 new handlers
│
├── controllers/
│   ├── goalkeepersController.ts              # all /api/goalkeepers/me/* + /api/goalkeepers/document-types routes,
│   │                                       # multer memory upload + file-type content check for document-photo
│   ├── requests/goalkeepers/
│   │   ├── saveIdentificationSectionRequest.ts   # zod schemas, all fields optional (research.md §3)
│   │   ├── savePhysicalDataSectionRequest.ts
│   │   ├── saveLocationSectionRequest.ts
│   │   └── saveAvailabilitySectionRequest.ts
│   ├── responses/goalkeepers/
│   │   └── goalkeeperRegistrationResponse.ts # controller-layer response type (mirrors application-layer DTO)
│   └── apiError.ts                        # reused as-is
│
├── app.ts                                  # extended: app.use('/api/goalkeepers', createGoalkeepersController(deps))
└── appDependencies.ts                      # unchanged shape — still just { mediator, verifyAccessToken, checkHealth }

tests/
├── unit/
│   └── application/features/goalkeepers/
│       ├── saveIdentificationSectionCommandHandler.test.ts
│       ├── savePhysicalDataSectionCommandHandler.test.ts
│       ├── saveLocationSectionCommandHandler.test.ts
│       ├── saveAvailabilitySectionCommandHandler.test.ts
│       ├── saveDocumentPhotoCommandHandler.test.ts
│       ├── activateGoalkeeperCommandHandler.test.ts
│       ├── cancelGoalkeeperRegistrationCommandHandler.test.ts
│       ├── getGoalkeeperRegistrationQueryHandler.test.ts
│       └── getDocumentTypesQueryHandler.test.ts
├── http/
│   └── controllers/
│       ├── goalkeepersGetRegistration.test.ts
│       ├── goalkeepersSaveSections.test.ts
│       ├── goalkeepersDocumentPhoto.test.ts
│       ├── goalkeepersActivate.test.ts
│       ├── goalkeepersCancel.test.ts
│       └── goalkeepersDocumentTypes.test.ts
└── fakes/
    ├── fakeGoalkeeperRegistrationRepository.ts
    ├── fakeGoalkeeperProfileRepository.ts
    └── fakeDocumentTypeRepository.ts
```

**Structure Decision**: Same single-project layout as `001`/`002` — a new `goalkeepers` feature slice added under the existing `domain/application/infrastructure/controllers` layering, following the identical per-feature folder shape (`common/ports.ts`, `commands/<name>/`, `queries/<name>/`) already used by `auth`, `profile`, `clients`, `locations`, and `images`. No new top-level directory, test tier, or architectural pattern is introduced. `GoalkeeperRegistration`/`GoalkeeperProfile`/`DocumentType` live together under one `domain/goalkeepers/` folder (rather than three separate feature folders) because they're inseparable parts of one coherent feature, matching how `001` grouped `User`/`ExternalIdentity`/`RefreshToken`/`TermsAcceptance` under `domain/users/`.

## Complexity Tracking

*No entries — Constitution Check raised no violations to justify.*
