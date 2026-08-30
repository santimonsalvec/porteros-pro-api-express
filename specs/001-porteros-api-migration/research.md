# Phase 0 Research: Migración del Backend PorterosPRO a Express + TypeScript

No `NEEDS CLARIFICATION` markers remained in the Technical Context after drafting it — every technology decision below is a planning-phase choice made against the spec's fidelity requirement (FR-040) and the source `.NET` implementation, not an open business question (those were already resolved in `/speckit.clarify`, see spec.md's Clarifications section). Each entry below still follows the Decision / Rationale / Alternatives format so the reasoning is auditable.

## 1. Runtime & language

**Decision**: Node.js 24 (Active LTS as of Aug 2026) + TypeScript ~6.x (the last release line built on the original JavaScript-hosted compiler).

**Rationale**: Node 24 is the current Active LTS line (Node 22 moved to Maintenance LTS); building on Active LTS maximizes support window. TypeScript 7.0 shipped a from-scratch Go-native compiler with major speed gains, but it explicitly lacks a stable programmatic API as of its 7.0 release — that API is what tools like `ts-node`/`tsx`, `typescript-eslint`, and various bundler/test-runner integrations depend on to type-check. Adopting 7.0 today risks broken or degraded tooling mid-migration for no functional benefit (the language surface is unchanged). Staying on the mature 6.x line keeps the full ecosystem (linting, editor tooling, Vitest's type-checking mode) working on day one.

**Alternatives considered**: TypeScript 7.0 — rejected for now due to incomplete programmatic-API/tooling support; can be revisited once the ecosystem catches up (does not require a spec change, purely a build-tooling upgrade later).

## 2. Web framework

**Decision**: Express 5.2.x.

**Rationale**: Express 5 is the Technical Committee's production-recommended, `latest`-tagged release on npm as of 2026, with native support for promise-rejecting async route handlers (removing the need for a manual `try/catch`-and-`next(err)` wrapper on every async handler) — a meaningful ergonomics win when replicating many small async controller actions faithfully. The user explicitly requested Express.

**Alternatives considered**: Express 4 (older, still supported, but 5 is now the recommended default with no reason to pick 4 for a new project); Fastify (faster, but the user specifically asked for Express).

## 3. Database access & repository pattern

**Decision**: Official `mongodb` Node.js driver (v7.x) used directly — no ODM (no Mongoose) — behind a generic `IRepository<TEntity, TId>` interface and a `MongoRepository<TEntity, TId>` base class, exactly mirroring the source's `MongoDB.Driver` + `IRepository<TEntity,TId>` + `MongoRepository<TEntity,TId>` design.

**Rationale**: The spec (FR-002, FR-006) and the source system both deliberately avoid an ORM/ODM in favor of a hand-rolled generic repository — replicating that decision preserves the exact abstraction shape the spec's acceptance scenarios describe (a new record type reuses `getAll`/`getById`/`add`/`update`/`delete` with zero duplicated code, SC-003). Introducing Mongoose here would add a schema/validation layer the source never had and would not improve fidelity.

**Alternatives considered**: Mongoose (rejected — adds an ODM layer and its own validation/casting semantics that the source system does not have, risking subtle behavioral drift); Prisma (rejected — no first-class fit for MongoDB's schemaless, driver-level idioms the source relies on, e.g. sparse indexes and `BsonDocument`-style raw reads for the externally-owned `Countries` collection).

## 4. Entity identifiers

**Decision**: `uuid` npm package (v9+), using its `v7()` export for every new entity id.

**Rationale**: The source system mints UUIDv7 string ids for every entity (`User`, `RefreshToken`, `TermsAcceptance`); UUIDv7 is time-ordered, which is why the source chose it over a random UUIDv4 or Mongo's own `ObjectId`. The mainstream `uuid` package added native `v7()` support in v9, avoiding a niche single-purpose dependency.

**Alternatives considered**: The dedicated `uuidv7` package (more specialized API, e.g. `V7Generator`, that this project doesn't need); MongoDB's own `ObjectId` (rejected — would silently change the id shape/type returned to clients, breaking the "no client-side changes" contract-parity requirement, FR-040).

## 5. Google credential validation

**Decision**: `google-auth-library` (v11.x), `OAuth2Client.verifyIdToken(...)`.

**Rationale**: Direct, official Node equivalent of the source's `Google.Apis.Auth` / `GoogleJsonWebSignature.ValidateAsync` — handles signature verification, issuer/audience checks, expiration, and JWKS key rotation without hand-rolled crypto, matching FR-009's validation requirements exactly.

**Alternatives considered**: Hand-rolled JWKS fetching + `jose`'s `jwtVerify` against Google's public keys — rejected as unnecessary reinvention when an official, actively maintained client library exists; would also require manually replicating Google's key-rotation handling.

## 6. Internal session tokens (access + refresh)

**Decision**: `jose` for signing/verifying the internal access JWT (HMAC via `SignJWT`/`jwtVerify`); a cryptographically random opaque string (via Node's built-in `crypto.randomBytes`, Base64URL-encoded) for the refresh token, with only its SHA-256 hash persisted — mirroring the source's `System.IdentityModel.Tokens.Jwt` (access token) + hashed opaque refresh token design exactly.

**Rationale**: `jose` is the current (2026) recommended JWT library for new Node.js projects — actively maintained, ESM-native, uses the platform's Web Crypto API, and enforces async crypto operations (avoiding event-loop-blocking synchronous signing under load). `jsonwebtoken` remains usable but is explicitly the legacy choice for existing codebases, not new ones. Since this is a greenfield TypeScript codebase, `jose` is the better long-term fit while producing functionally identical JWTs (same claims: `sub`, `email`, `isAdmin`, `profileComplete`; same issuer/audience/expiration semantics) — contract parity (FR-040) is about the token's claims and validation behavior, not the signing library.

**Alternatives considered**: `jsonwebtoken` — rejected as the legacy/synchronous-crypto choice, appropriate only for maintaining an existing Node codebase, which this is not.

## 7. Authorization policies (`ClientOnly`, `CompleteProfile`)

**Decision**: Plain Express middleware functions (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`) that read claims off the request's verified JWT payload and either call `next()` or respond with the standard `401`/`403`, stacked in router definitions exactly where the source stacks `[Authorize]` attributes (e.g. `PATCH /api/clients/me` stacks `requireClientOnly` + `requireCompleteProfile`, matching the source's stacked `ClientOnly` + `CompleteProfile` policies).

**Rationale**: Express has no built-in authorization-policy framework equivalent to ASP.NET Core's `IAuthorizationHandler`; middleware composition is the idiomatic Express equivalent and preserves the exact same claim-based, single-responsibility-per-check design (one middleware per policy, composed per-route) without introducing a heavier framework-within-a-framework.

**Alternatives considered**: A generic policy-registry abstraction mimicking ASP.NET Core's named-policy system — rejected as unnecessary indirection for exactly two policies; plain composable middleware is simpler and equally testable in isolation (SC-003-style "no duplicated code" is preserved since both policies and any future one share the same `requireAuth` claim-extraction step).

## 8. Request validation

**Decision**: `zod` for parsing/validating request body and query-parameter *shape* (required fields present, correct primitive types); the source system's exact business-rule validators (non-empty name after trim, WhatsApp number 6–14 digits after stripping non-digits, country-code lookup, terms-acceptance boolean) are ported as plain functions inside the corresponding command/query handlers, preserving the exact same field-level error messages and `fieldErrors` shape the contracts define.

**Rationale**: The source system never used FluentValidation — its validation is entirely hand-written inside each handler (per the code-analysis: `CompleteProfileCommandHandler.Validate` / `UpdateClientProfileCommandHandler.Validate`, duplicated by design between the two). Replicating that exactly (rather than centralizing into a shared validator) preserves fidelity and avoids introducing behavior the source never had; `zod` is added only at the HTTP boundary to reject structurally malformed requests (wrong types, missing keys) before they reach a handler, which is a reasonable, low-risk addition since the source's ASP.NET model binding already performed the analogous structural check implicitly (a malformed JSON body never reached a C# record constructor either).

**Alternatives considered**: `express-validator` (viable but more middleware-chain-oriented; `zod`'s schema-first approach maps more directly onto the source's `record` request DTOs); hand-written structural checks only, no library (rejected — reinvents what `zod` already does well, for no fidelity benefit).

## 9. Mediator (CQRS)

**Decision**: A small, hand-built TypeScript mediator — `ICommand<TResponse>`/`IQuery<TResponse>` marker interfaces, `ICommandHandler`/`IQueryHandler` interfaces, and a `Mediator` class implementing `ISender` with a `Map`-based handler registry keyed by request constructor/type tag — directly ported from the source's self-built mediator.

**Rationale**: The source system explicitly avoids MediatR (or any third-party mediator) by design (FR-010 in the source's own `001-clean-architecture-foundation` spec: "self-built (non-third-party) mediator"); replicating that same constraint here (no `mediatr`-style npm package) preserves both the architectural intent and this migration's own FR-041 (test the mediator's dispatch/error behavior identically: exactly-one-handler dispatch, `MediatorHandlerNotFoundError` for zero handlers, `MediatorRegistrationError` for duplicate registration).

**Alternatives considered**: A third-party Node CQRS/mediator library — rejected, would contradict the explicit "self-built" requirement the source system establishes and this migration inherits via FR-040 (reproduce existing backend's behavior, including its architectural choices where they are business-meaningful constraints, not incidental).

## 10. Observability

**Decision**: `@opentelemetry/sdk-node` with HTTP + Express auto-instrumentation, `@opentelemetry/exporter-trace-otlp-http` used when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, falling back to `@opentelemetry/sdk-trace-node`'s console/`ConsoleSpanExporter` otherwise.

**Rationale**: Direct equivalent of the source's `OpenTelemetry.Instrumentation.AspNetCore` + OTLP-exporter-with-console-fallback configuration (FR-039), auto-instrumenting incoming Express requests without per-route code changes.

**Alternatives considered**: A vendor-specific APM SDK (e.g., a hosted-provider-only agent) — rejected, since the source deliberately stays vendor-neutral (plain OpenTelemetry + OTLP), and this migration must not introduce a new vendor dependency the source never had.

## 11. Health check

**Decision**: A small hand-written health module (no third-party health-check library) that issues a `db.command({ ping: 1 })` against MongoDB with a short timeout, exposed at `GET /health`, returning `{ status, checks: [{ name: "mongodb", status }] }` with `200` for `Healthy`/`Degraded` and `503` for `Unhealthy`, and never including exception detail.

**Rationale**: Express has no built-in health-check framework (unlike ASP.NET Core's `IHealthCheck`/`HealthCheckService`); the check itself is a single Mongo ping, simple enough that a small custom module is both sufficient and avoids an unnecessary dependency, while reproducing the exact response shape and status-code convention the contract defines (`contracts/health.md`).

**Alternatives considered**: A generic Node health-check library (e.g., `@godaddy/terminus`) — rejected as unneeded weight for a single dependency check; would also need to be shaped to match the source's exact `{name, status}` response regardless.

## 12. Structured logging

**Decision**: `pino` for structured JSON logs, used for general request logging and specifically to replicate the source's SSO-attempt audit log (`ExchangeSsoCredentialCommandHandler.LogAttempt`, recording provider/platform/success/failure-reason per FR-010-equivalent audit requirement).

**Rationale**: `pino` is the standard low-overhead structured logger for Node/Express services, closely matching the structured, low-ceremony logging the source gets from `Microsoft.Extensions.Logging`.

**Alternatives considered**: `winston` (heavier, more configuration surface than needed here); plain `console.log` (rejected — the audit-log requirement needs structured, queryable fields, not free-text lines).

## 13. Configuration

**Decision**: Read all configuration from `process.env` at runtime; `dotenv` loaded only in local development to populate `process.env` from an untracked `.env` file (mirroring the source's `dotnet user-secrets`, which is also dev-only and never committed).

**Rationale**: FR-004/FR-021-equivalent requirement: connection strings and secrets come exclusively from environment configuration, never a source-controlled file. `dotenv` in dev mode is a convenience for populating the same environment-variable surface locally; it changes nothing about the production contract (env vars only).

**Alternatives considered**: A config-management library (e.g., `convict`) — rejected as unneeded structure for a small, flat set of env vars that already have a well-defined shape from the source system's own `appsettings`/env-var list.

## 14. Testing stack (no real resource, per Clarifications session 2026-08-30 — supersedes the original 2026-08-29 decision below)

**Decision**:
- **Unit**: Vitest 4.x, hand-written in-memory fake repositories/services (no `vi.mock`/mocking library for these — mirrors the source's fakes-over-Moq convention exactly), with `vi.fn()` reserved only for simple call-tracking spies equivalent to the source's `RecordingFakeUserRepository` (e.g., asserting `update` was never called on a rejected path).
- **Repository layer**: also Vitest, using a hand-rolled `vi.fn()`-based stand-in for the MongoDB driver's `Collection`/`Db` (`tests/fakes/fakeMongoCollection.ts`) — no real or containerized database of any kind. Each test mocks the specific driver method it needs (`findOne`, `insertOne`, `updateOne`, …) and asserts the exact filter/document shape the repository sent, and/or substitutes a canned resolved value to drive the mapping logic. This verifies *this system's own* query construction and document mapping, but — by design, per the 2026-08-30 clarification — no longer verifies that MongoDB itself enforces a unique/sparse index; that engine-level behavior is a manual/operational concern now, not an automated-test one.
- **HTTP-level**: `supertest` against the assembled Express `app` instance (no real network socket), direct equivalent of `WebApplicationFactory<Program>` + `Microsoft.AspNetCore.Mvc.Testing`, with infrastructure dependencies swappable at composition-root wiring for the same kind of substitution the source does via `ConfigureTestServices`/`RemoveAll<T>()` (e.g., a stub `IGoogleIdTokenValidator` equivalent) — the fake-backed test app never touches a real database either.
- **Architecture**: a small custom Vitest test (`tests/architecture/layering.test.ts`) that statically scans `src/domain/**` and `src/application/**` import specifiers and fails if either references `src/infrastructure/**` or `src/controllers/**` — direct equivalent of the source's reflection-based `LayeringTests.cs`.

**Rationale**: The product owner explicitly ruled out any real resource in the test suite (2026-08-30 clarification), which takes priority over the earlier 2026-08-29 "full pyramid with a real/ephemeral database" decision recorded below (kept for history, not current guidance). Mocking at the driver boundary still gives meaningful regression coverage of the repository classes' own logic (the part most likely to contain a real bug) while keeping the suite dependency-free, deterministic, and fast (the full suite — previously ~60s with Docker/Testcontainers — now runs in under a second).

**Alternatives considered**: Keeping `@testcontainers/mongodb` (rejected outright by the 2026-08-30 clarification — any real or containerized database is out, regardless of ephemerality); `mongodb-memory-server` (also rejected — it still runs a real `mongod` binary, which is a real resource by the same rule, even though it's not Docker-based); Jest in place of Vitest (viable, but Vitest's native ESM/TS support and faster iteration fit this greenfield TS project better).

---

*Historical — 2026-08-29 decision, superseded above*: The original plan called `@testcontainers/mongodb` (v12.x) the repository tier's tool, spinning a real ephemeral `mongo` Docker container per test run to verify actual index/uniqueness behavior no in-memory fake could faithfully reproduce. The 2026-08-30 clarification session overrode this: no automated test may depend on any real resource, full stop — see spec.md Clarifications for the exact question and answer.

## 15. Module system & build

**Decision**: Native ESM (`"type": "module"` in `package.json`) throughout; `tsc` (TypeScript 6.x) compiles `src/` to `dist/` for production; `tsx watch` for local dev hot-reload; Vitest handles its own TS transform independently via esbuild (decoupled from the `tsc` version choice in research item 1).

**Rationale**: ESM is the current default, forward-compatible module system for new Node/TypeScript projects and pairs cleanly with `jose` and modern `@opentelemetry/*` packages, which increasingly ship ESM-first.

**Alternatives considered**: CommonJS — rejected as legacy default with no advantage for a brand-new project in 2026.
