# porteros-pro-api Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-08-30

## Active Technologies
- TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository (see `specs/001-porteros-api-migration/plan.md`). + Existing stack (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) plus three new dependencies scoped to this feature: `cloudinary` 2.x (official Node SDK — the storage provider adapter, see research.md §1); `multer` 2.x with in-memory storage (Express does not parse `multipart/form-data` itself — see research.md §2); `file-type` 22.x (magic-byte content sniffing, so an upload is validated by its actual bytes, not its claimed MIME type or file extension — see research.md §3). (002-cloudinary-image-storage)
- MongoDB — one new collection, `images`, holding one `StoredImage` document per successfully stored image (shape in data-model.md). The underlying file itself lives at Cloudinary; the Mongo document is the system's own generic, provider-independent record of it (FR-004). (002-cloudinary-image-storage)

- TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale. + Express 5.2.x (web framework); official `mongodb` driver 7.x (no ODM, mirrors the source's raw `MongoDB.Driver` usage); `google-auth-library` 11.x (`OAuth2Client.verifyIdToken`, official equivalent of `Google.Apis.Auth`); `jose` (JWT sign/verify, chosen over legacy `jsonwebtoken` — see research.md); `zod` (request DTO shape validation); `uuid` v9+ (`v7()` for entity ids, matching the source's UUIDv7 convention); `pino` (structured logging, audit-log equivalent); `@opentelemetry/sdk-node` + HTTP/Express auto-instrumentation + OTLP/console exporters (observability parity) (001-porteros-api-migration)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale.: Follow standard conventions

## Recent Changes
- 002-cloudinary-image-storage: Added TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository (see `specs/001-porteros-api-migration/plan.md`). + Existing stack (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) plus three new dependencies scoped to this feature: `cloudinary` 2.x (official Node SDK — the storage provider adapter, see research.md §1); `multer` 2.x with in-memory storage (Express does not parse `multipart/form-data` itself — see research.md §2); `file-type` 22.x (magic-byte content sniffing, so an upload is validated by its actual bytes, not its claimed MIME type or file extension — see research.md §3).

- 001-porteros-api-migration: Added TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale. + Express 5.2.x (web framework); official `mongodb` driver 7.x (no ODM, mirrors the source's raw `MongoDB.Driver` usage); `google-auth-library` 11.x (`OAuth2Client.verifyIdToken`, official equivalent of `Google.Apis.Auth`); `jose` (JWT sign/verify, chosen over legacy `jsonwebtoken` — see research.md); `zod` (request DTO shape validation); `uuid` v9+ (`v7()` for entity ids, matching the source's UUIDv7 convention); `pino` (structured logging, audit-log equivalent); `@opentelemetry/sdk-node` + HTTP/Express auto-instrumentation + OTLP/console exporters (observability parity)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
