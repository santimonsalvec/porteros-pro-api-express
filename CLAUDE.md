# porteros-pro-api Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-08-29

## Active Technologies

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

- 001-porteros-api-migration: Added TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale. + Express 5.2.x (web framework); official `mongodb` driver 7.x (no ODM, mirrors the source's raw `MongoDB.Driver` usage); `google-auth-library` 11.x (`OAuth2Client.verifyIdToken`, official equivalent of `Google.Apis.Auth`); `jose` (JWT sign/verify, chosen over legacy `jsonwebtoken` — see research.md); `zod` (request DTO shape validation); `uuid` v9+ (`v7()` for entity ids, matching the source's UUIDv7 convention); `pino` (structured logging, audit-log equivalent); `@opentelemetry/sdk-node` + HTTP/Express auto-instrumentation + OTLP/console exporters (observability parity)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
