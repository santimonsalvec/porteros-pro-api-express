# Implementation Plan: Migración del Backend PorterosPRO a Express + TypeScript

**Branch**: `001-porteros-api-migration` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-porteros-api-migration/spec.md`

## Summary

Port the existing `SMC.PorterosPRO.Backend` (.NET 10 / ASP.NET Core / MongoDB) to a new Express + TypeScript backend with exact behavioral and HTTP-contract parity, so the existing mobile app and admin web can point at it without client-side changes. The source system's own layered architecture (Domain/Application/Infrastructure), self-built CQRS mediator, generic repository pattern over MongoDB, Google SSO authentication with JWT sessions, mandatory mobile profile-completion onboarding, client profile view/update, public country reference data, and health/observability are all reproduced one-for-one on the new stack, along with a test suite mirroring the original's three-tier pyramid (unit, repository-integration, HTTP-level).

## Technical Context

**Language/Version**: TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale.
**Primary Dependencies**: Express 5.2.x (web framework); official `mongodb` driver 7.x (no ODM, mirrors the source's raw `MongoDB.Driver` usage); `google-auth-library` 11.x (`OAuth2Client.verifyIdToken`, official equivalent of `Google.Apis.Auth`); `jose` (JWT sign/verify, chosen over legacy `jsonwebtoken` — see research.md); `zod` (request DTO shape validation); `uuid` v9+ (`v7()` for entity ids, matching the source's UUIDv7 convention); `pino` (structured logging, audit-log equivalent); `@opentelemetry/sdk-node` + HTTP/Express auto-instrumentation + OTLP/console exporters (observability parity)
**Storage**: MongoDB — same collection shapes as the existing backend (`users`, `refreshTokens`, `termsAcceptances`, `Countries`), same indexes (unique compound on `externalIdentities.provider`+`subject`, sparse unique on `normalizedPhoneNumber`), reusable as-is or schema-compatible
**Testing**: Vitest 4.x — unit tests with hand-written in-memory fakes (no mocking library, mirroring the source's fakes-over-mocks convention); repository-layer tests against a `vi.fn()`-based mock of the MongoDB driver's `Collection`/`Db` (no real or containerized database — see Clarifications session 2026-08-30, which overrides the original Testcontainers-based plan); `supertest` for HTTP-level endpoint tests against the Express app (equivalent of `WebApplicationFactory`), also fake-backed, no real database
**Target Platform**: Linux server (containerized Node.js process), same deployment shape as the existing ASP.NET Core service
**Project Type**: Single backend web-service project (this repository is API-only; no frontend/mobile code lives here)
**Performance Goals**: SSO credential exchange completes in <10s backend processing (SC-011); session renewal in <5s backend processing (SC-012); health status reflects a MongoDB outage/recovery within 5s (SC-008) — all carried over unchanged from the existing backend's own commitments
**Constraints**: Clean cutover only — no requirement for this backend and the .NET one to run simultaneously in production or to accept each other's tokens (Clarifications session 2026-08-29); no data-migration/ETL tooling in scope, only collection-shape compatibility; access tokens remain short-lived and non-revocable by design (FR-019); error responses must never leak internal detail or allow account enumeration (FR-043/FR-044)
**Scale/Scope**: Matches the existing backend's production scale; this migration introduces no new throughput/concurrency target (deferred as low-impact during `/speckit.clarify`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` in this repository is still the unfilled template (no project-specific principles have been ratified yet) — there are no concrete constitutional gates to evaluate against. In the absence of ratified gates, this plan self-applies the general engineering discipline already required by the spec itself: layered separation with an enforced dependency direction (FR-001, mirrored from the source's own architecture test), a full test pyramid written alongside the implementation rather than after (FR-041), and no speculative abstraction beyond what the source system already has (Assumptions: "no new business capability... beyond what the existing backend already provides"). No violations to justify; no entries needed in Complexity Tracking.

*Post-Phase-1 re-check*: Unchanged — Phase 1 design (data-model.md, contracts/, quickstart.md) introduces no new dependency, entity, or capability beyond what Phase 0 already scoped from the source system. Gate still passes.

## Project Structure

### Documentation (this feature)

```text
specs/001-porteros-api-migration/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domain/                          # Pure business rules — no Express, no MongoDB driver, no framework imports
│   ├── common/
│   │   └── entity.ts                # Entity<TId> base type (id + value equality)
│   ├── users/
│   │   ├── user.ts                  # User aggregate: createFromExternalIdentity, completeProfile, updateProfile, normalizePhoneNumber
│   │   ├── externalIdentity.ts      # Value object: provider, subject, email
│   │   ├── refreshToken.ts          # create, isActive, markUsed
│   │   └── termsAcceptance.ts
│   └── countries/
│       └── country.ts
│
├── application/                     # Use cases — depends only on domain + its own ports (interfaces)
│   ├── common/
│   │   ├── mediator/
│   │   │   ├── types.ts             # ICommand, IQuery, ICommandHandler, IQueryHandler, ISender
│   │   │   ├── mediator.ts          # Handler registry + dispatch; throws on missing/duplicate handler
│   │   │   └── errors.ts            # MediatorHandlerNotFoundError, MediatorRegistrationError
│   │   └── persistence/
│   │       └── repository.ts        # IRepository<TEntity, TId>: getAll/getById/add/update/delete
│   └── features/
│       ├── auth/
│       │   ├── common/              # Ports: ISsoProviderCatalog, IGoogleIdTokenValidator, IInternalTokenIssuer, IUserRepository, IRefreshTokenRepository; shared DTOs (SsoProviderConfig, TokenPairResponse)
│       │   ├── queries/getSsoOptions/
│       │   └── commands/{exchangeSsoCredential,refreshAccessToken}/
│       ├── profile/
│       │   ├── common/
│       │   └── commands/completeProfile/
│       ├── clients/
│       │   ├── common/              # ClientProfileResponse.from(user)
│       │   ├── queries/getClientProfile/
│       │   └── commands/updateClientProfile/
│       └── locations/
│           ├── common/              # ICountryRepository
│           └── queries/getCountries/
│
├── infrastructure/                  # Technical details — implements Application's ports
│   ├── auth/
│   │   ├── googleIdTokenValidator.ts
│   │   ├── jwtInternalTokenIssuer.ts (+ jwtOptions.ts)
│   │   ├── googleSsoProviderCatalog.ts (+ googleSsoOptions.ts)
│   │   └── middleware/              # requireAuth, requireClientOnly, requireCompleteProfile — Express equivalents of [Authorize]/policies
│   ├── persistence/mongo/
│   │   ├── mongoConnectionProvider.ts # singleton MongoClient/Db, built from MONGODB_CONNECTION_STRING
│   │   ├── mongoRepository.ts        # generic IRepository implementation
│   │   ├── userRepository.ts / refreshTokenRepository.ts / termsAcceptanceRepository.ts / countryRepository.ts
│   ├── healthChecks/
│   │   └── mongoHealthCheck.ts
│   ├── observability/
│   │   └── otel.ts                  # OTLP exporter, console fallback
│   └── di.ts                        # composition root — wires ports to implementations
│
├── controllers/                     # Express routers — the presentation layer (no separate "Presentation" folder, same rationale as the source: this project's entry point *is* the API)
│   ├── requests/{auth,clients,profile}/   # zod schemas / TS request shapes
│   ├── responses/{auth,clients,common,health,profile}/
│   ├── authController.ts / clientsController.ts / locationsController.ts / profileController.ts / healthController.ts
│
├── app.ts                           # Express app assembly: middleware, routers, error handling
└── server.ts                        # entry point: loads env, builds app via di.ts, starts listening

tests/
├── unit/
│   ├── application/features/{auth,clients,locations,profile}/*.test.ts
│   ├── application/mediator/*.test.ts
│   └── infrastructure/persistence/mongo/*.test.ts   # mocked Collection/Db — no real database (Clarifications 2026-08-30)
├── http/
│   └── controllers/*.test.ts                        # supertest against the Express app, fake-backed
├── architecture/
│   └── layering.test.ts                             # asserts domain/application never import infrastructure
└── fakes/
    ├── fakeUserRepository.ts / fakeRefreshTokenRepository.ts / fakeCountryRepository.ts
    ├── fakeInternalTokenIssuer.ts / fakeGoogleIdTokenValidator.ts
    └── fakeMongoCollection.ts                       # vi.fn()-based Collection stand-in for repository tests
```

**Structure Decision**: Single project (this repository is the API only — no frontend/mobile code here), organized by the same Domain → Application → Infrastructure layering as the source `.NET` project, with Express routers standing in for ASP.NET Core controllers as the presentation layer. Folder names and feature groupings (`features/auth`, `features/profile`, `features/clients`, `features/locations`) mirror the source project's `Application/Features/*` layout directly, so the mapping between the two codebases stays obvious during and after the migration.

## Complexity Tracking

*No entries — Constitution Check raised no violations to justify.*
