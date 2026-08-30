---

description: "Task list for Migración del Backend PorterosPRO a Express + TypeScript"
---

# Tasks: Migración del Backend PorterosPRO a Express + TypeScript

**Input**: Design documents from `/specs/001-porteros-api-migration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Explicitly required by this feature — FR-041. Originally planned per the `/speckit.clarify` session (2026-08-29) as a three-tier pyramid with the repository tier running against a real/ephemeral database (Testcontainers). **Amended 2026-08-30**: no automated test may depend on any real resource; the repository tier below instead mocks the MongoDB driver's `Collection`/`Db` directly (`tests/fakes/fakeMongoCollection.ts`) and lives under `tests/unit/infrastructure/persistence/mongo/` — task descriptions below that still say "integration test" / `tests/integration/...` / `@testcontainers/mongodb` describe the original (superseded) plan; see spec.md Clarifications (2026-08-30) and research.md §14 for the current, actually-implemented approach. Every user story phase below still includes test tasks, written before the implementation tasks they verify.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on another incomplete task in this list)
- **[Story]**: Which user story this task belongs to (US1–US6); Setup, Foundational, and Polish tasks carry no story label
- File paths are exact and match `plan.md`'s Project Structure section

## Path Conventions

Single backend project (this repo is API-only): `src/` and `tests/` at the repository root, exactly as laid out in `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic tooling

- [X] T001 Create the project skeleton: `src/{domain,application,infrastructure}/`, `src/controllers/{requests,responses}/`, `tests/{unit,integration,http,architecture,fakes,fixtures}/`, per `plan.md`'s Project Structure
- [X] T002 Initialize `package.json` (ESM, `"type": "module"`) and install pinned dependencies from `research.md`: `express`, `mongodb`, `google-auth-library`, `jose`, `zod`, `uuid`, `pino`, `@opentelemetry/sdk-node`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-express`, `@opentelemetry/exporter-trace-otlp-http`; devDependencies: `typescript` (~6.x), `tsx`, `vitest`, `supertest`, `@testcontainers/mongodb`, `@types/express`, `@types/supertest`, `@types/uuid`, `eslint`, `typescript-eslint`, `prettier`
- [X] T003 [P] Create `tsconfig.json` (strict mode, ESM/NodeNext resolution) at repository root
- [X] T004 [P] Configure `vitest.config.ts` with separate `unit`, `integration`, and `http` test projects/globs mapping to `tests/unit`, `tests/integration`, `tests/http`
- [X] T005 [P] Configure ESLint + Prettier (`eslint.config.js`, `.prettierrc`) and create `.env.example` listing every environment variable from `quickstart.md`

**Checkpoint**: Tooling in place; no application code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting mechanisms every user story's handlers and routes depend on — the self-built mediator, the Express app shell, config/logging. Nothing here is itself one of the spec's 6 user stories, but every story needs it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 [P] Create `Entity<TId>` abstract base class (id + value equality) in `src/domain/common/entity.ts`
- [X] T007 [P] Define mediator core types — `ICommand<TResponse>`, `IQuery<TResponse>`, `ICommandHandler`, `IQueryHandler`, `ISender`, `IBaseRequest` — in `src/application/common/mediator/types.ts`
- [X] T008 [P] Define `MediatorHandlerNotFoundError` and `MediatorRegistrationError` in `src/application/common/mediator/errors.ts`
- [X] T009 Implement the `Mediator` class (handler registry keyed by request type, `send()`, `registerHandlers()`) in `src/application/common/mediator/mediator.ts` (depends on T007, T008)
- [X] T010 Write unit tests for the mediator — exactly-one-handler dispatch, `MediatorHandlerNotFoundError` on zero handlers, `MediatorRegistrationError` on duplicate registration — in `tests/unit/application/mediator/mediator.test.ts` (depends on T009); per `contracts/mediator.md`
- [X] T011 [P] Implement structured logger setup (`pino`) in `src/infrastructure/observability/logger.ts`
- [X] T012 [P] Implement environment/config loader (`dotenv` in development only; validates required vars fail-fast) in `src/infrastructure/config.ts`
- [X] T013 Implement the centralized Express error-handling middleware translating thrown/handler errors into the standard `{error, message}` / `{error, message, fieldErrors}` envelope, never leaking stack traces or internal detail (FR-044) in `src/controllers/errorHandler.ts`
- [X] T014 Assemble the base Express app (JSON body parsing, request logging via T011, router mount points, error handler from T013) in `src/app.ts` (depends on T011, T013)
- [X] T015 Implement the server entry point (loads config via T012, builds the app via T014, starts listening on `PORT`) in `src/server.ts` (depends on T012, T014)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Layered Architecture with Repository-Backed Persistence (Priority: P1) 🎯 MVP

**Goal**: Domain/Application/Infrastructure separation is real and enforced, and a generic, reusable repository abstraction (get all, get by id, add, update, delete) sits behind a single shared MongoDB connection, so every later story can persist data without rewriting data-access code.

**Independent Test**: Define a fixture record type, exercise the shared repository's common operations against a real (ephemeral, Dockerized) MongoDB instance, and confirm application/domain code never imports a MongoDB-driver-specific type.

### Tests for User Story 1

- [X] T016 [P] [US1] Write the architecture/layering test — fails if anything under `src/domain/**` or `src/application/**` imports from `src/infrastructure/**` or `src/controllers/**` — in `tests/architecture/layering.test.ts`
- [X] T017 [P] [US1] Create a fixture entity + throwaway collection helper used only by tests to exercise `MongoRepository` generically, in `tests/fixtures/testFixtureEntity.ts`
- [X] T018 [P] [US1] Write an integration test for `MongoConnectionProvider` — single shared client across calls, fail-fast on missing/invalid `MONGODB_CONNECTION_STRING` — in `tests/integration/infrastructure/persistence/mongo/mongoConnectionProvider.test.ts` (uses `@testcontainers/mongodb`)
- [X] T019 [US1] Write an integration test for the generic `MongoRepository` CRUD operations (getAll/getById/add/update/delete) against the fixture from T017, in `tests/integration/infrastructure/persistence/mongo/mongoRepository.test.ts` (depends on T017)
- [X] T020 [US1] Write an integration test asserting a data-access failure after successful startup (e.g., the container stopped mid-test) propagates immediately to the caller with no retry, in `tests/integration/infrastructure/persistence/mongo/mongoRepositoryFailurePropagation.test.ts`

### Implementation for User Story 1

- [X] T021 [P] [US1] Define the generic `IRepository<TEntity, TId>` interface (`getAll`, `getById`, `add`, `update`, `delete`) in `src/application/common/persistence/repository.ts`
- [X] T022 [US1] Implement `MongoConnectionProvider` — a singleton `MongoClient`/`Db` built once from `MONGODB_CONNECTION_STRING`, failing fast when missing/invalid — in `src/infrastructure/persistence/mongo/mongoConnectionProvider.ts` (depends on T021, T012)
- [X] T023 [US1] Implement the generic `MongoRepository<TEntity, TId>` base class against the official `mongodb` driver's `Collection<TEntity>`, propagating any driver failure immediately (no retry) — in `src/infrastructure/persistence/mongo/mongoRepository.ts` (depends on T021, T022)

**Checkpoint**: User Story 1 is fully functional and independently testable — `npm run test:integration` exercises real persistence behavior with zero MongoDB-driver leakage outside `src/infrastructure`.

---

## Phase 4: User Story 2 - Sign In via Google SSO and Stay Authenticated (Priority: P1)

**Goal**: A client can discover available SSO providers, exchange a completed Google sign-in for a backend-issued access+refresh token pair, use the access token to reach a protected capability, and renew it later without repeating Google sign-in.

**Independent Test**: Request discovery for a platform, complete a real/test Google sign-in, exchange the credential, call `GET /api/auth/me` with the resulting access token, then redeem the refresh token for a new access token without contacting Google again.

### Domain & ports for User Story 2

- [X] T024 [P] [US2] Create the `ExternalIdentity` value object (provider, subject, email; value equality on provider+subject) in `src/domain/users/externalIdentity.ts`
- [X] T025 [US2] Create the `User` aggregate with `createFromExternalIdentity(...)` factory (initializes profile fields to `null`/`false`) in `src/domain/users/user.ts` (depends on T024, T006)
- [X] T026 [P] [US2] Create the `RefreshToken` entity (`create`, `isActive`, `markUsed`) in `src/domain/users/refreshToken.ts` (depends on T006)
- [X] T027 [P] [US2] Define Auth feature ports (`ISsoProviderCatalog`, `IGoogleIdTokenValidator`, `IInternalTokenIssuer`, `IUserRepository`, `IRefreshTokenRepository`) and shared DTOs (`SsoProviderConfig`, `TokenPairResponse`) in `src/application/features/auth/common/`

### Tests for User Story 2

- [X] T028 [P] [US2] Write hand-written in-memory fakes — `fakeUserRepository.ts`, `fakeRefreshTokenRepository.ts`, `fakeGoogleIdTokenValidator.ts`, `fakeInternalTokenIssuer.ts` — in `tests/fakes/` (no mocking library; depends on T027)
- [X] T029 [P] [US2] Write unit tests for `GetSsoOptionsQueryHandler` (valid platform, missing/unrecognized platform → rejected, platform with no configured providers → empty list) in `tests/unit/application/features/auth/getSsoOptions.test.ts`
- [X] T030 [P] [US2] Write unit tests for `ExchangeSsoCredentialCommandHandler` (mobile auto-provisions a new account; admin-web rejects unknown-or-non-admin identity with an *identical* response for both cases per FR-043; invalid credential rejected with no token; returning identity resolves to the same account) in `tests/unit/application/features/auth/exchangeSsoCredential.test.ts`
- [X] T031 [P] [US2] Write unit tests for `RefreshAccessTokenCommandHandler` (success rotates to a new pair; expired/used/unrecognized tokens rejected with an identical response per FR-043) in `tests/unit/application/features/auth/refreshAccessToken.test.ts`

### Implementation for User Story 2

- [X] T032 [US2] Implement `GetSsoOptionsQueryHandler` in `src/application/features/auth/queries/getSsoOptions/getSsoOptionsQueryHandler.ts` (depends on T027, T029)
- [X] T033 [US2] Implement `ExchangeSsoCredentialCommandHandler` (mobile/admin-web account-resolution policy, audit logging of every attempt) in `src/application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommandHandler.ts` (depends on T025, T026, T027, T030)
- [X] T034 [US2] Implement `RefreshAccessTokenCommandHandler` (single-use rotation) in `src/application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommandHandler.ts` (depends on T026, T027, T031)
- [X] T035 [P] [US2] Implement `GoogleIdTokenValidator` using `google-auth-library`'s `OAuth2Client.verifyIdToken` (any failure → `null`, never throws) in `src/infrastructure/auth/googleIdTokenValidator.ts`
- [X] T036 [P] [US2] Implement `JwtInternalTokenIssuer` using `jose` (issues access+refresh pair with `sub`/`email`/`isAdmin`/`profileComplete` claims; opaque refresh token hashed with SHA-256 before persistence) and `jwtOptions.ts` (env-configurable lifetimes) in `src/infrastructure/auth/jwtInternalTokenIssuer.ts`
- [X] T037 [P] [US2] Implement `GoogleSsoProviderCatalog` and `googleSsoOptions.ts` (env-driven per-platform client IDs/scopes; omits a platform with incomplete config) in `src/infrastructure/auth/googleSsoProviderCatalog.ts`
- [X] T038 [P] [US2] Implement the concrete `UserRepository` (extends `MongoRepository<User, string>`; `findByExternalIdentity`; creates the unique compound index on `externalIdentities.provider`+`subject`) in `src/infrastructure/persistence/mongo/userRepository.ts` (depends on T023, T025)
- [X] T039 [P] [US2] Implement the concrete `RefreshTokenRepository` (extends `MongoRepository<RefreshToken, string>`; `findActiveByHash`; `markUsed` via a partial update) in `src/infrastructure/persistence/mongo/refreshTokenRepository.ts` (depends on T023, T026)
- [X] T040 [P] [US2] Implement `requireAuth` middleware (verifies the bearer JWT via `jose`, attaches decoded claims to the request; `401` with no body on failure) in `src/infrastructure/auth/middleware/requireAuth.ts` (depends on T036)

### Repository-integration tests for User Story 2

- [X] T041 [P] [US2] Write integration tests for `UserRepository` (unique compound index rejects a duplicate `provider`+`subject`, CRUD round-trip) in `tests/integration/infrastructure/persistence/mongo/userRepository.test.ts`
- [X] T042 [P] [US2] Write integration tests for `RefreshTokenRepository` (`findActiveByHash` excludes used/expired tokens, `markUsed` is irreversible) in `tests/integration/infrastructure/persistence/mongo/refreshTokenRepository.test.ts`

### Controller for User Story 2

- [X] T043 [P] [US2] Define auth request/response shapes (`zod` schemas + TS types) per `contracts/sso-options.md`, `sso-exchange.md`, `token-refresh.md`, `auth-me.md`, `token-claims.md` in `src/controllers/requests/auth/` and `src/controllers/responses/auth/`
- [X] T044 [US2] Implement `authController` router — `GET /api/auth/sso-options`, `POST /api/auth/sso/exchange`, `POST /api/auth/tokens/refresh`, `GET /api/auth/me` (with `requireAuth`) — in `src/controllers/authController.ts` (depends on T032, T033, T034, T040, T043)
- [X] T045 [US2] Mount `authController` on the app in `src/app.ts` (depends on T044, T014)

### HTTP-level tests for User Story 2

- [X] T046 [P] [US2] Write HTTP tests for `GET /api/auth/sso-options` (per `contracts/sso-options.md`: valid platform, missing/unrecognized platform → 400) in `tests/http/controllers/authSsoOptions.test.ts`
- [X] T047 [P] [US2] Write HTTP tests for `POST /api/auth/sso/exchange` (per `contracts/sso-exchange.md`: mobile success, admin-web success/reject, invalid credential) in `tests/http/controllers/authSsoExchange.test.ts`
- [X] T048 [P] [US2] Write HTTP tests for `POST /api/auth/tokens/refresh` (per `contracts/token-refresh.md`: success rotation, invalid/used/expired) in `tests/http/controllers/authTokenRefresh.test.ts`
- [X] T049 [P] [US2] Write HTTP tests for `GET /api/auth/me` (per `contracts/auth-me.md`: valid token, missing/invalid token → 401) in `tests/http/controllers/authMe.test.ts`

**Checkpoint**: User Stories 1 AND 2 both work independently — a client can discover providers, log in, reach a protected endpoint, and refresh its session.

---

## Phase 5: User Story 3 - Complete Mandatory Profile After First Login (Priority: P2)

**Goal**: A new mobile account is told its profile is incomplete, can submit name/WhatsApp/terms-acceptance to complete it, and durable proof of terms acceptance is recorded.

**Independent Test**: Sign in as a brand-new mobile account, confirm it reports an incomplete profile, submit the required fields plus terms acceptance, and confirm the profile is now complete with a terms-acceptance record on file.

### Domain & ports for User Story 3

- [X] T050 [US3] Extend `User` with `completeProfile(firstName, lastName, countryCallingCode, whatsAppNumber)` and the static `normalizePhoneNumber(countryCallingCode, whatsAppNumber)` in `src/domain/users/user.ts` (depends on T025)
- [X] T051 [P] [US3] Create the `TermsAcceptance` entity in `src/domain/users/termsAcceptance.ts` (depends on T006)
- [X] T052 [P] [US3] Create the `Country` entity (tolerant `id`, `name`, `dialCode`, `countryCode`) in `src/domain/countries/country.ts` (depends on T006)
- [X] T053 [P] [US3] Define Profile feature ports (`ICountryRepository`, `ITermsAcceptanceRepository`) and DTOs (`CompleteProfileCommand`, `CompleteProfileOutcome`) in `src/application/features/profile/common/`
- [X] T054 [US3] Extend `IUserRepository` (from T027) with `existsByPhoneNumber(countryCallingCode, whatsAppNumber, excludeUserId?)` in `src/application/features/auth/common/ports.ts` (depends on T027)

### Tests for User Story 3

- [X] T055 [P] [US3] Write `fakeCountryRepository.ts` and `fakeTermsAcceptanceRepository.ts` in `tests/fakes/`, and extend `fakeUserRepository.ts` with `existsByPhoneNumber` (depends on T028, T053, T054)
- [X] T056 [P] [US3] Write unit tests for `CompleteProfileCommandHandler` (success issues fresh tokens + terms record; missing/invalid field → `validation_failed` with field errors and no partial save; unrecognized country → `invalid_country_code`; duplicate normalized phone → `duplicate_phone_number`; already-complete → `already_complete`, identical whether the account is complete or doesn't exist per FR-043) in `tests/unit/application/features/profile/completeProfile.test.ts`

### Implementation for User Story 3

- [X] T057 [US3] Implement `CompleteProfileCommandHandler` (validates fields, resolves country → dial code, checks phone uniqueness, calls `user.completeProfile(...)`, persists exactly one `TermsAcceptance`, re-issues the token pair with `profileComplete: "true"`) in `src/application/features/profile/commands/completeProfile/completeProfileCommandHandler.ts` (depends on T050, T053, T054, T056)
- [X] T058 [P] [US3] Implement the concrete `TermsAcceptanceRepository` (extends `MongoRepository<TermsAcceptance, string>`, append-only) in `src/infrastructure/persistence/mongo/termsAcceptanceRepository.ts` (depends on T023, T051)
- [X] T059 [P] [US3] Implement the concrete `CountryRepository` (raw-document reads tolerant of `ObjectId`-or-`string` `_id`; `findByCountryCode`; write operations rejected) in `src/infrastructure/persistence/mongo/countryRepository.ts` (depends on T052)
- [X] T060 [US3] Extend the concrete `UserRepository` with `existsByPhoneNumber` and the sparse unique index on `normalizedPhoneNumber` in `src/infrastructure/persistence/mongo/userRepository.ts` (depends on T038, T054)

### Repository-integration tests for User Story 3

- [X] T061 [P] [US3] Write integration tests for `TermsAcceptanceRepository` (append-only `add`) in `tests/integration/infrastructure/persistence/mongo/termsAcceptanceRepository.test.ts`
- [X] T062 [P] [US3] Write integration tests for `CountryRepository` (`findByCountryCode`, write operations rejected) in `tests/integration/infrastructure/persistence/mongo/countryRepository.test.ts`
- [X] T063 [US3] Write an integration test for `UserRepository.existsByPhoneNumber` and the sparse unique index (two never-completed profiles don't collide; two completed profiles with formatting-only differences do collide) in `tests/integration/infrastructure/persistence/mongo/userRepositoryPhoneUniqueness.test.ts`

### Controller for User Story 3

- [X] T064 [P] [US3] Define profile request/response shapes per `contracts/complete-profile.md` in `src/controllers/requests/profile/` and `src/controllers/responses/profile/`
- [X] T065 [US3] Implement `profileController` router — `POST /api/profile/complete` (protected by `requireAuth`) — in `src/controllers/profileController.ts` (depends on T057, T040, T064)
- [X] T066 [US3] Mount `profileController` on the app in `src/app.ts` (depends on T065, T045)

### HTTP-level tests for User Story 3

- [X] T067 [P] [US3] Write HTTP tests for `POST /api/profile/complete` (per `contracts/complete-profile.md`: success, validation_failed, invalid_country_code, duplicate_phone_number, profile_already_complete) in `tests/http/controllers/profileComplete.test.ts`

**Checkpoint**: User Stories 1–3 work independently; mandatory onboarding is fully functional end-to-end.

---

## Phase 6: User Story 4 - View and Update My Client Profile (Priority: P2)

**Goal**: A signed-in client with a completed profile can view their own profile and update name/WhatsApp number; admins and incomplete profiles are rejected from update.

**Independent Test**: Sign in as a client with a completed profile, retrieve the profile and confirm the five fields, submit an update, and confirm a subsequent view reflects it.

### Domain & ports for User Story 4

- [X] T068 [US4] Add `User.updateProfile(firstName, lastName, countryCallingCode, whatsAppNumber)` (recomputes `normalizedPhoneNumber`, does not touch `isProfileComplete`) in `src/domain/users/user.ts` (depends on T050)
- [X] T069 [P] [US4] Define Clients feature ports/DTOs — `ClientProfileResponse.from(user)` projection, `GetClientProfileQuery`/`Outcome`, `UpdateClientProfileCommand`/`Outcome` — in `src/application/features/clients/common/`
- [X] T070 [US4] Extend `IUserRepository.existsByPhoneNumber` with the `excludeUserId` parameter (default `undefined`, preserving T057's call site) in `src/application/features/auth/common/ports.ts` (depends on T054)

### Tests for User Story 4

- [X] T071 [P] [US4] Write `recordingFakeUserRepository.ts` (tracks whether `update` was called, for no-op assertions) and extend `fakeUserRepository.ts` for `excludeUserId` in `tests/fakes/` (depends on T055, T070)
- [X] T072 [P] [US4] Write unit tests for `GetClientProfileQueryHandler` (success returns exactly five fields; missing/incomplete fields render as `null`; account deleted → `not_found`) in `tests/unit/application/features/clients/getClientProfile.test.ts`
- [X] T073 [P] [US4] Write unit tests for `UpdateClientProfileCommandHandler` (success; validation_failed; invalid_country_code; duplicate_phone_number excluding the caller's own number; profile_not_complete; not_found) in `tests/unit/application/features/clients/updateClientProfile.test.ts`

### Implementation for User Story 4

- [X] T074 [US4] Implement `GetClientProfileQueryHandler` in `src/application/features/clients/queries/getClientProfile/getClientProfileQueryHandler.ts` (depends on T069, T072)
- [X] T075 [US4] Implement `UpdateClientProfileCommandHandler` in `src/application/features/clients/commands/updateClientProfile/updateClientProfileCommandHandler.ts` (depends on T068, T069, T070, T073)
- [X] T076 [P] [US4] Implement `requireClientOnly` middleware (succeeds when `isAdmin === "false"`; else `403` with no body) in `src/infrastructure/auth/middleware/requireClientOnly.ts` (depends on T040)
- [X] T077 [P] [US4] Implement `requireCompleteProfile` middleware (succeeds when `profileComplete === "true"`; else `403` with no body) in `src/infrastructure/auth/middleware/requireCompleteProfile.ts` (depends on T040)
- [X] T078 [P] [US4] Write unit tests for `requireClientOnly` and `requireCompleteProfile` in `tests/unit/infrastructure/auth/authorizationMiddleware.test.ts` (depends on T076, T077); per `contracts/authorization-middleware.md`

### Controller for User Story 4

- [X] T079 [P] [US4] Define clients request/response shapes per `contracts/get-client-profile.md` and `contracts/update-client-profile.md` in `src/controllers/requests/clients/` and `src/controllers/responses/clients/`
- [X] T080 [US4] Implement `clientsController` router — `GET /api/clients/me` (`requireAuth`+`requireClientOnly`), `PATCH /api/clients/me` (`requireAuth`+`requireClientOnly`+`requireCompleteProfile`) — in `src/controllers/clientsController.ts` (depends on T074, T075, T076, T077, T079)
- [X] T081 [US4] Mount `clientsController` on the app in `src/app.ts` (depends on T080, T066)

### HTTP-level tests for User Story 4

- [X] T082 [P] [US4] Write HTTP tests for `GET /api/clients/me` (success, incomplete-profile empty fields, admin → 403, unauthenticated → 401, deleted account → 404) in `tests/http/controllers/clientsGetProfile.test.ts`
- [X] T083 [P] [US4] Write HTTP tests for `PATCH /api/clients/me` (success, validation_failed, duplicate excluding self, admin/incomplete → 403, unauthenticated → 401, deleted account → 404) in `tests/http/controllers/clientsUpdateProfile.test.ts`

**Checkpoint**: User Stories 1–4 work independently; full client self-service profile lifecycle is functional.

---

## Phase 7: User Story 5 - Browse Country Reference Data (Priority: P3)

**Goal**: Any client, authenticated or not, can retrieve the full country catalog.

**Independent Test**: Call the capability with no authentication and confirm it returns the full country catalog.

- [X] T084 [P] [US5] Write unit tests for `GetCountriesQueryHandler` (projects every fake-repository country) in `tests/unit/application/features/locations/getCountries.test.ts`
- [X] T085 [US5] Implement `GetCountriesQueryHandler` (reuses `ICountryRepository` from Phase 5) in `src/application/features/locations/queries/getCountries/getCountriesQueryHandler.ts` (depends on T053, T084)
- [X] T086 [P] [US5] Define the countries response shape per `contracts/locations-countries.md` in `src/controllers/responses/locations/countriesResponse.ts`
- [X] T087 [US5] Implement `locationsController` router — `GET /api/locations/countries` (public) — in `src/controllers/locationsController.ts` (depends on T085, T086)
- [X] T088 [US5] Mount `locationsController` on the app in `src/app.ts` (depends on T087, T081)
- [X] T089 [P] [US5] Write HTTP tests for `GET /api/locations/countries` (per `contracts/locations-countries.md`) in `tests/http/controllers/locationsCountries.test.ts`

**Checkpoint**: User Stories 1–5 work independently.

---

## Phase 8: User Story 6 - Operational Health & Observability (Priority: P3)

**Goal**: `GET /health` reports service + MongoDB status without leaking internal detail, and every request is traced via OpenTelemetry with an OTLP/console fallback.

**Independent Test**: Call the health capability while MongoDB is reachable (expect healthy) and while unreachable (expect unhealthy, dependency named, no internal detail); confirm a trace is produced for an ordinary request.

- [X] T090 [P] [US6] Implement `MongoHealthCheck` (`db.command({ ping: 1 })` with a short timeout; never surfaces exception detail) in `src/infrastructure/healthChecks/mongoHealthCheck.ts` (depends on T022)
- [X] T091 [P] [US6] Implement OpenTelemetry setup — HTTP + Express auto-instrumentation, OTLP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, console exporter fallback otherwise — in `src/infrastructure/observability/otel.ts`
- [X] T092 [P] [US6] Define the health report response shape per `contracts/health-check.md` in `src/controllers/responses/health/healthReportResponse.ts`
- [X] T093 [US6] Implement `healthController` router — `GET /health` mapping `Healthy`/`Degraded` → `200`, `Unhealthy` → `503` — in `src/controllers/healthController.ts` (depends on T090, T092)
- [X] T094 [US6] Mount `healthController` and start the OpenTelemetry SDK at process bootstrap in `src/server.ts` and `src/app.ts` (depends on T091, T093, T088)
- [X] T095 [P] [US6] Write an integration test for `MongoHealthCheck` — healthy while reachable; reflects unhealthy within 5s of the container stopping and healthy again within 5s of recovery — in `tests/integration/infrastructure/healthChecks/mongoHealthCheck.test.ts`
- [X] T096 [P] [US6] Write a unit test for OpenTelemetry exporter selection (OTLP endpoint set → OTLP exporter chosen; unset → console/in-memory fallback) in `tests/unit/infrastructure/observability/otelExporterSelection.test.ts`
- [X] T097 [P] [US6] Write HTTP tests for `GET /health` (200 healthy body shape, 503 unhealthy body shape, no internal detail present in either) in `tests/http/controllers/health.test.ts`

**Checkpoint**: All six user stories are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final wiring and validation across every story

- [X] T098 [P] Wire `package.json` scripts — `dev` (`tsx watch src/server.ts`), `build` (`tsc`), `start` (`node dist/server.js`), `test`, `test:integration`, `test:http`, `test:all` — matching `quickstart.md`
- [X] T099 Audit every controller's error paths to confirm they all funnel through the shared error envelope from T013 and never leak internal detail or distinguish "not found" from "unauthorized" in a way that aids enumeration (FR-043, FR-044, SC-010)
- [X] T100 Run the full `quickstart.md` walkthrough end-to-end against a locally running instance (every curl example, every npm test script) and fix any discrepancy found
- [X] T101 Run the complete test suite (`npm run test:all`) and confirm `npm run build` completes with zero TypeScript errors (SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational + User Story 1 (needs the generic repository and Mongo connection to build `UserRepository`/`RefreshTokenRepository`)
- **User Story 3 (Phase 5)**: Depends on User Story 2 (extends `User`, reuses `requireAuth`, `IUserRepository`)
- **User Story 4 (Phase 6)**: Depends on User Story 3 (reuses `existsByPhoneNumber`, requires a completed profile)
- **User Story 5 (Phase 7)**: Depends on User Story 3 (reuses `ICountryRepository`/`CountryRepository` introduced there)
- **User Story 6 (Phase 8)**: Depends on User Story 1 only (needs `MongoConnectionProvider`); independent of Stories 2–5 otherwise
- **Polish (Phase 9)**: Depends on all desired user stories being complete

Unlike a purely additive feature set, this migration's stories have a natural build order (each protects or extends data the previous one created) rather than being fully parallel-by-team; Story 6 is the one exception that can be staffed independently as soon as Story 1 lands.

### Parallel Opportunities

- All `[P]`-marked Setup tasks (T003–T005) run together once T001–T002 land
- All `[P]`-marked Foundational tasks (T006–T008, T011–T012) run together
- Within each user story, `[P]`-marked domain/port/fake/test files with no listed dependency on each other run together (e.g., T035–T039 in User Story 2 all touch different infrastructure files)
- HTTP-level test files for a story's different endpoints (e.g., T046–T049) always run in parallel — each is a separate file exercising a separate route

---

## Parallel Example: User Story 2

```bash
# Domain + ports (after Foundational + US1):
Task: "Create ExternalIdentity value object in src/domain/users/externalIdentity.ts"
Task: "Create RefreshToken entity in src/domain/users/refreshToken.ts"
Task: "Define Auth feature ports and shared DTOs in src/application/features/auth/common/"

# Once fakes exist, unit tests in parallel:
Task: "Unit tests for GetSsoOptionsQueryHandler in tests/unit/application/features/auth/getSsoOptions.test.ts"
Task: "Unit tests for ExchangeSsoCredentialCommandHandler in tests/unit/application/features/auth/exchangeSsoCredential.test.ts"
Task: "Unit tests for RefreshAccessTokenCommandHandler in tests/unit/application/features/auth/refreshAccessToken.test.ts"

# Infrastructure, all different files:
Task: "Implement GoogleIdTokenValidator in src/infrastructure/auth/googleIdTokenValidator.ts"
Task: "Implement JwtInternalTokenIssuer in src/infrastructure/auth/jwtInternalTokenIssuer.ts"
Task: "Implement GoogleSsoProviderCatalog in src/infrastructure/auth/googleSsoProviderCatalog.ts"
Task: "Implement UserRepository in src/infrastructure/persistence/mongo/userRepository.ts"
Task: "Implement RefreshTokenRepository in src/infrastructure/persistence/mongo/refreshTokenRepository.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: User Story 1 — persistence foundation
4. Complete Phase 4: User Story 2 — sign-in works end-to-end
5. **STOP and VALIDATE**: a client can discover providers, exchange a Google credential, reach `GET /api/auth/me`, and refresh — this is the smallest slice with real end-user value (an authenticated session), even before onboarding/profile management exist
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → persistence proven independently
3. User Story 2 → authentication works → demo-able MVP
4. User Story 3 → mandatory onboarding completes the mobile flow
5. User Story 4 → clients can self-manage their profile
6. User Story 5 → country picker data available (unblocks any client-side polish on Stories 3/4's forms)
7. User Story 6 → operational readiness (can be pulled forward right after Story 1 if ops visibility is needed sooner)
8. Polish → final cross-cutting validation

### Parallel Team Strategy

Given the dependency chain above (2→3→4→5, with 6 branching off 1), true story-per-developer parallelism is limited until Story 2 lands. Once it does:

- Developer A: Story 3 → Story 4 (sequential, same dependency chain)
- Developer B: Story 6 (independent of 3/4/5)
- Story 5 can be picked up by whichever developer finishes first, once Story 3's `CountryRepository` exists

---

## Notes

- `[P]` tasks touch different files and have no unmet dependency in this list
- `[Story]` labels map every user-story-phase task to its spec.md story for traceability
- Every unit/integration/HTTP test task must be written and observed failing before its paired implementation task is completed (TDD, per FR-041)
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
- Avoid: vague tasks, two tasks editing the same file marked `[P]` together, cross-story dependencies that break a story's independent testability beyond what's declared above
