# Implementation Plan: Cloudinary Image Storage Integration

**Branch**: `002-cloudinary-image-storage` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-cloudinary-image-storage/spec.md`

## Summary

Add a reusable, generic image-storage capability to this backend's infrastructure and application layers: an `IImageStorageProvider` port backed by a Cloudinary adapter (uploads are optimized for file size at the provider via an upload-time transformation, never a custom image-processing pipeline of our own), a `StoredImage` Mongo-backed entity/repository that is deliberately decoupled from Cloudinary's own response shape, and three mediator commands/queries (store, resolve, delete) wired behind a minimal `/api/images` controller. Because no other feature in this codebase yet references a stored image (per spec Assumptions), this plan's own endpoints apply the safe default resolved in `/speckit.clarify`: every access is authenticated, and — absent any other resource to delegate to — is restricted to the uploader; future features that attach a `StoredImage` id to their own entities (e.g., an identity-document field) are expected to layer their own resource-level authorization on top. On-demand transformation, editing, and every other Cloudinary capability unrelated to storage is explicitly out of scope (FR-011).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository (see `specs/001-porteros-api-migration/plan.md`).
**Primary Dependencies**: Existing stack (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) plus three new dependencies scoped to this feature: `cloudinary` 2.x (official Node SDK — the storage provider adapter, see research.md §1); `multer` 2.x with in-memory storage (Express does not parse `multipart/form-data` itself — see research.md §2); `file-type` 22.x (magic-byte content sniffing, so an upload is validated by its actual bytes, not its claimed MIME type or file extension — see research.md §3).
**Storage**: MongoDB — one new collection, `images`, holding one `StoredImage` document per successfully stored image (shape in data-model.md). The underlying file itself lives at Cloudinary; the Mongo document is the system's own generic, provider-independent record of it (FR-004).
**Testing**: Vitest, same three-tier convention as the rest of the repo — handler-level unit tests against hand-written fakes for the two new ports (`IImageStorageProvider`, and the `images` `IRepository`); a repository-layer unit test against a mocked `Collection` (no real database, matching the project-wide convention); `supertest` HTTP tests against the new `/api/images` endpoints, including multipart upload via `.attach()`.
**Target Platform**: Linux server (same containerized Node.js process as the rest of this backend).
**Project Type**: Single backend web-service project (this repository is API-only).
**Performance Goals**: Upload-to-availability under 5s under normal network conditions (spec SC-001); deletion takes effect (image no longer retrievable, record gone) within 5s (spec SC-004).
**Constraints**: Max accepted upload size 10 MB, overridable via `IMAGE_MAX_UPLOAD_SIZE_BYTES` (spec Assumptions — provisional default); accepted formats JPEG/PNG/WEBP/HEIC/HEIF, validated by content not filename (spec Assumptions, edge cases); optimization MUST happen at the provider via an upload-time transformation, not a bespoke pipeline (FR-002); an image's location is never reachable through a standalone unauthenticated endpoint — every resolution requires authentication and is authorized (FR-005); once handed out through an authorized response, that location is a stable, non-expiring link — no signed/expiring-URL machinery is introduced (Clarifications 2026-08-30, session Q2); no on-demand transformation/editing/effects capability is implemented or exposed (FR-011).
**Scale/Scope**: No new throughput target; this is a foundational, currently consumer-less capability (spec Assumptions) — its own minimal `/api/images` surface exists so the three user stories are independently demonstrable per spec, scoped to "manage your own uploads" until a future feature attaches a `StoredImage` to its own entity and takes over authorization for that context.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no project-specific principles have been ratified, so there are no concrete gates to evaluate against. In their absence, this plan self-applies the same discipline the `001` plan did and this codebase already exercises: the new capability sits behind a port (`IImageStorageProvider`) so Cloudinary is swappable without touching application code (mirrors FR-004's "not coupled to the provider's response"); the generic `IRepository<TEntity, TId>` is reused rather than a bespoke image-specific persistence interface; tests are written alongside the implementation, not after; and no speculative feature is added beyond what spec.md's FR-001–FR-012 actually require (FR-011 explicitly forbids reaching for extra provider capabilities). No violations to justify; no entries needed in Complexity Tracking.

*Post-Phase-1 re-check*: Unchanged — Phase 1 design (data-model.md, contracts/, quickstart.md) introduces exactly one new entity (`StoredImage`), one new Mongo collection (`images`), and no capability beyond what Phase 0 scoped. Gate still passes.

## Project Structure

### Documentation (this feature)

```text
specs/002-cloudinary-image-storage/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md         # Phase 1 output (/speckit.plan command)
├── quickstart.md         # Phase 1 output (/speckit.plan command)
├── contracts/            # Phase 1 output (/speckit.plan command)
└── tasks.md              # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── images/
│       └── storedImage.ts                 # StoredImage entity (extends Entity<string>)
│
├── application/
│   └── features/
│       └── images/
│           ├── common/
│           │   ├── ports.ts               # IImageStorageProvider, IImageRepository (extends IRepository<StoredImage,string>)
│           │   └── storedImageResponse.ts # toStoredImageResponse(image): DTO shape returned to callers
│           ├── commands/
│           │   ├── storeImage/
│           │   │   ├── storeImageCommand.ts
│           │   │   └── storeImageCommandHandler.ts   # upload → provider, then persist; compensating delete on DB-write failure (FR-012)
│           │   └── deleteImage/
│           │       ├── deleteImageCommand.ts
│           │       └── deleteImageCommandHandler.ts  # not_found / forbidden / success outcomes (FR-006, FR-008)
│           └── queries/
│               └── resolveImage/
│                   ├── resolveImageQuery.ts
│                   └── resolveImageQueryHandler.ts   # not_found / forbidden / success outcomes (FR-005, FR-006)
│
├── infrastructure/
│   ├── images/
│   │   ├── cloudinaryOptions.ts           # env-driven config (cloud name, api key/secret, max bytes, allowed formats)
│   │   └── cloudinaryImageStorageProvider.ts  # implements IImageStorageProvider using the `cloudinary` SDK
│   ├── persistence/mongo/
│   │   └── imageRepository.ts             # extends MongoRepository<StoredImage,string>, collection `images`
│   └── di.ts                              # extended: wires CloudinaryImageStorageProvider + ImageRepository + the 3 new handlers
│
├── controllers/
│   ├── imagesController.ts                # POST/GET/DELETE /api/images, multer memory upload + file-type content check
│   ├── responses/images/
│   │   └── storedImageResponse.ts         # response type for the controller layer (id, url, format, bytes, width, height, createdAt)
│   └── apiError.ts                        # reused as-is
│
├── app.ts                                  # extended: app.use('/api/images', createImagesController(deps))
└── appDependencies.ts                      # unchanged shape — still just { mediator, verifyAccessToken, checkHealth }

tests/
├── unit/
│   ├── application/features/images/
│   │   ├── storeImageCommandHandler.test.ts
│   │   ├── deleteImageCommandHandler.test.ts
│   │   └── resolveImageQueryHandler.test.ts
│   └── infrastructure/persistence/mongo/imageRepository.test.ts   # mocked Collection, no real database
├── http/
│   └── controllers/imagesController.test.ts   # supertest, multipart .attach(), fake-backed
└── fakes/
    ├── fakeImageStorageProvider.ts
    └── fakeImageRepository.ts
```

**Structure Decision**: Same single-project layout as `001` — a new `images` feature slice added under the existing `domain/application/infrastructure/controllers` layering, following the identical per-feature folder shape (`common/ports.ts`, `commands/<name>/`, `queries/<name>/`) already used by `auth`, `profile`, `clients`, and `locations`. No new top-level directory, test tier, or architectural pattern is introduced.

## Complexity Tracking

*No entries — Constitution Check raised no violations to justify.*
