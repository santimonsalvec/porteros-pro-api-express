# Feature Specification: Migración del Backend PorterosPRO a Express + TypeScript

**Feature Branch**: `001-porteros-api-migration`
**Created**: 2026-08-29
**Status**: Draft
**Input**: User description: "en el proyecto /Users/santiagomonsalve/Documents/Projects/net/SMC.PorterosPRO.Backend tengo el backend e mi aplicación en .net, pero no quiero continuar con .net, quiero hacerlo con express y typescript entonces tu objetivo es replicar ese proyecto aqui. debemos incluir el servicio de bases de datos con el patron repositorio y todos los demás servicios que hay allá al igual que las pruebas unitarias. en conclusión quiero tener esa misma api pero en express con typescript"

## Clarifications

The source system (`SMC.PorterosPRO.Backend`) is itself fully specified via its own prior specs (`001-clean-architecture-foundation` through `004-get-client-profile`) plus one additional implemented capability (country reference data), which this specification uses as the authoritative source of truth for scope and behavior. Reasonable defaults for migration-specific questions (data continuity, out-of-band processes, configuration approach) are documented under Assumptions below.

### Session 2026-08-29

- Q: Should the migration replicate the full test pyramid (unit + repository integration tests against a real/in-memory database + HTTP-level endpoint tests), or limit to pure unit tests with mocked dependencies only? → A: Full pyramid parity — unit tests (fakes/mocks) plus repository-level integration tests against a real or in-memory database plus HTTP-level endpoint tests, mirroring the existing backend's test suite exactly.
- Q: Does the new Express/TypeScript backend need to coexist in production with the existing .NET backend during a transition period (requiring cross-system session/token compatibility), or is this a clean, full replacement? → A: Clean cutover — the new backend fully replaces the .NET one at deployment; no requirement for both to run simultaneously against production traffic, and no requirement for sessions/tokens issued by one to be valid on the other.
- Q: Should the specific processing-time thresholds from the existing backend's own specs (SSO credential exchange ≤10s backend processing; session renewal ≤5s backend processing) carry over as measurable success criteria for this migration, or is functional parity alone sufficient without restating performance numbers? → A: Carry them over as new measurable success criteria for this migration, so the port introduces no silent performance regression.

### Session 2026-08-30

- Q: The prior session decided the test suite's repository tier would run against "a real or in-memory database instance" (e.g. via an ephemeral containerized database). Should that stand, or must every automated test — including the repository tier — avoid any real resource entirely? → A: No real resource at all, ever, for any test — repository tests must substitute mocked responses at the database-driver boundary instead of exercising a real or containerized database engine. This supersedes the "real or in-memory database" phrasing from the prior session; FR-041/SC-002 are amended accordingly. Consequence accepted: automated tests no longer verify that the database engine itself enforces uniqueness/index constraints (e.g. the sparse unique index behavior) — only that this system's own repository code sends the correct query/update shape. That engine-level behavior becomes a manual/operational verification concern rather than an automated one.

## User Scenarios & Testing *(mandatory)*

<!--
  This feature is a full technology migration, not a new business capability: every
  user story below reproduces the behavior of an already-shipped capability in the
  existing .NET backend, one-for-one, on the new Express/TypeScript stack. Priorities
  reflect what must exist before the next capability is meaningful (an unauthenticated
  client can't complete a profile; an incomplete profile can't be viewed as "complete").
-->

### User Story 1 - Layered Architecture with Repository-Backed Persistence (Priority: P1)

As a developer maintaining the new backend, I need the codebase organized into clearly separated domain, application, and infrastructure concerns, with a generic, provider-agnostic data-access abstraction (common operations: get all, get by id, add, update, delete) backed by a single shared database connection, so that business rules stay decoupled from technical details and every future capability reuses the same persistence pattern instead of re-implementing data access.

**Why this priority**: Every other capability in this migration stores or retrieves data. Without this foundation in place first, none of the other user stories have a consistent, testable way to persist anything.

**Independent Test**: Can be fully verified by defining a sample record type, exercising the shared repository's common operations against a real database instance, and confirming that business/use-case code never references database-driver-specific types directly.

**Acceptance Scenarios**:

1. **Given** a fresh checkout of the repository, **When** a developer inspects the project layout, **Then** domain rules, use-case/application logic, and technical/infrastructure concerns (database, external services, web framework wiring) live in clearly separate, identifiable locations.
2. **Given** the shared repository abstraction exists, **When** a new type of record needs to be persisted, **Then** its data-access layer reuses the common operations without re-implementing get-all, get-by-id, add, update, or delete.
3. **Given** the application is running, **When** many data-access operations occur across different requests, **Then** the underlying database connection is established once and reused, never recreated per operation.
4. **Given** the database connection details are required, **When** the service starts, **Then** they are supplied via environment configuration rather than a source-controlled file, and the service fails fast with a clear error if that configuration is missing or invalid.
5. **Given** the database becomes unreachable after a successful startup, **When** a data-access operation is attempted, **Then** the failure is reported to the caller immediately, with no silent retry loop.

---

### User Story 2 - Sign In via Google SSO and Stay Authenticated (Priority: P1)

As a user of the mobile app or the admin web app, I need to discover which single sign-on providers are available and then exchange my completed Google sign-in for a backend-issued session, so that I can securely reach the parts of the system that require an authenticated identity, and later renew that session without repeating the Google sign-in flow every time it expires.

**Why this priority**: No other user-specific capability (profile completion, profile viewing/editing) can be exercised without an authenticated identity. This is the gateway to the rest of the system.

**Independent Test**: Can be fully tested end-to-end by requesting the discovery endpoint for a given platform, completing a real or test Google sign-in, exchanging the resulting credential for an internal session, calling a protected capability with it, and then using the accompanying renewal credential to obtain a new session without contacting Google again.

**Acceptance Scenarios**:

1. **Given** a client (mobile or admin web) is about to show its login screen, **When** it asks the backend which SSO providers are available for its platform, **Then** it receives Google plus the configuration data needed to start Google's sign-in flow, with no provider configuration hardcoded in the client.
2. **Given** a client completes Google sign-in and receives a credential from Google, **When** it submits that credential to the backend, **Then** the backend validates it against Google (signature, issuer, audience, expiration) and, only if valid, issues an internal session (an access credential plus a longer-lived renewal credential).
3. **Given** the exchange request comes from the mobile app and no account matches the verified Google identity yet, **When** the credential is otherwise valid, **Then** a new account is created automatically and the session is issued for it.
4. **Given** the exchange request comes from the admin web and no pre-existing administrator account matches the verified Google identity, **When** the credential is otherwise valid, **Then** the login is rejected as unauthorized, no account is created, and no session is issued.
5. **Given** a tampered, expired, or wrong-audience credential is submitted to the exchange, **When** it is processed, **Then** the request is rejected and no session is issued.
6. **Given** a previously issued renewal credential that is still valid, **When** it is submitted to the session-renewal capability, **Then** a new access credential is issued without requiring a new Google sign-in.
7. **Given** an expired, already-used, or unrecognized renewal credential, **When** it is submitted, **Then** the request is rejected and no new access credential is issued.

---

### User Story 3 - Complete Mandatory Profile After First Login (Priority: P2)

As a new mobile-app user who has just signed in for the first time, I need to be told my profile is incomplete, provide my name, WhatsApp contact number, and accept the Terms & Conditions and Privacy Policy, and be blocked from the rest of the app until I do, so that the business collects the minimum required data from every user and has durable proof of consent.

**Why this priority**: This is the mandatory next step after authentication (User Story 2) for every new mobile account, and the "profile complete" state it produces is a prerequisite for User Story 4.

**Independent Test**: Can be fully tested by signing in as a brand-new mobile account, confirming the client is told the profile is incomplete, submitting the required fields plus terms acceptance, and confirming the profile is now reported complete with a durable acceptance record on file.

**Acceptance Scenarios**:

1. **Given** a user has just signed in for the first time on the mobile app, **When** the app checks the account's status, **Then** it is told the profile is incomplete, so it can route to the complete-profile screen instead of guessing.
2. **Given** the user is completing their profile, **When** they view their email, **Then** it is pre-filled from their Google account and cannot be edited through this capability.
3. **Given** the user supplies first name, last name, a country calling code, a WhatsApp number, and accepts the terms, **When** they submit, **Then** the profile is saved as complete, a timestamped terms-acceptance record is stored identifying the user and the document version(s) accepted, and a fresh session reflecting the completed profile is issued.
4. **Given** a required field is missing or the terms box is unchecked, **When** submission is attempted, **Then** it is rejected with a clear indication of what is missing, and no partial data is saved.
5. **Given** the submitted country calling code plus WhatsApp number already belongs to a different account, **When** submission is attempted, **Then** it is rejected as a duplicate and no data changes on either account.
6. **Given** an account whose profile is already complete, **When** the completion capability is invoked again, **Then** no data changes and the caller is clearly told the profile was already complete rather than the call silently succeeding or being treated as a generic error.
7. **Given** a user with an incomplete profile, **When** they attempt to use any other part of the app, **Then** they are routed back to the complete-profile step every time, until it is completed.

---

### User Story 4 - View and Update My Client Profile (Priority: P2)

As a signed-in client with a completed profile, I need to view my own name, email, WhatsApp number, and the date I became a client, and update my name and WhatsApp number when they change, so that my account information stays accurate and I can review it at any time.

**Why this priority**: This is the main ongoing self-service capability for an established user, but it depends on an account first existing (User Story 2) and having completed onboarding (User Story 3).

**Independent Test**: Can be fully tested by signing in as a client with a completed profile, retrieving the profile and confirming the five expected fields, then submitting a change to name and WhatsApp number and confirming a subsequent view reflects it.

**Acceptance Scenarios**:

1. **Given** a signed-in client with a completed profile, **When** they request their profile, **Then** the response contains exactly their own first name, last name, email, WhatsApp number (with country prefix), and account creation date — never another account's data.
2. **Given** a signed-in client whose profile is not yet complete, **When** they request their profile, **Then** the missing fields are represented as empty rather than the request failing, while email and creation date are still returned.
3. **Given** a signed-in client with a completed profile, **When** they submit a new first name, last name, and WhatsApp number, **Then** the change is saved and reflected on the next profile view, and email remains unchanged regardless of what was submitted.
4. **Given** invalid data (blank name, badly formatted WhatsApp number) or a WhatsApp number already registered to a different account, **When** an update is submitted, **Then** it is rejected and the previously stored values remain unchanged.
5. **Given** a client whose profile is not yet complete, **When** they attempt to use the update capability, **Then** the request is rejected and they are directed to complete their profile first.
6. **Given** a signed-in administrator account, **When** it calls either the view or update capability, **Then** the request is rejected — these capabilities serve client accounts only.
7. **Given** no valid session is presented, **When** either capability is called, **Then** the request is rejected without disclosing any profile data.

---

### User Story 5 - Browse Country Reference Data (Priority: P3)

As any client application, I need to retrieve the full list of countries with their names, dial codes, and ISO codes, so that I can populate a country/phone-code picker without maintaining my own copy of that list.

**Why this priority**: This is reference data that supports the forms in User Stories 3 and 4 (selecting a country calling code); it has standalone value but is not itself gated behind authentication or any other story.

**Independent Test**: Can be fully tested by calling the capability with no authentication and confirming it returns the full country catalog.

**Acceptance Scenarios**:

1. **Given** any caller, authenticated or not, **When** they request the country catalog, **Then** they receive every country's name, dial code, and ISO code.

---

### User Story 6 - Operational Health & Observability (Priority: P3)

As an operator of the service, I need a health-check capability that reports whether the service and its database dependency are operational, plus basic request tracing, so that monitoring and deployment tooling can determine readiness and requests can be diagnosed without feature-specific instrumentation code.

**Why this priority**: Valuable from day one of running the new service in any real environment, but it does not block any of the business-facing capabilities above and is naturally validated last, once there is a running service and a database dependency to report on.

**Independent Test**: Can be fully tested by calling the health capability while the database is reachable (expecting a healthy result) and while it is unreachable (expecting a degraded/unhealthy result that names the failing dependency but exposes no internal error detail), and by confirming a trace is produced for an ordinary request.

**Acceptance Scenarios**:

1. **Given** the service and its database dependency are running normally, **When** the health capability is called, **Then** it reports the service as healthy.
2. **Given** the database dependency is unreachable, **When** the health capability is called, **Then** it reports the service as unhealthy/degraded, names the failing dependency, and includes no internal error detail (connection strings, stack traces, driver messages).
3. **Given** the service is running with tracing configured, **When** any request is processed, **Then** a trace is recorded with basic metadata (route, status, duration) without requiring any feature-specific code changes.

---

### Edge Cases

- What happens when the database connection configuration is missing, empty, or malformed at startup? The service must fail fast with a clear, descriptive error rather than starting in a broken state.
- What happens when the discovery capability (User Story 2) is called without a platform indicator, or with an unrecognized one? The request must be rejected rather than silently defaulting to either platform's configuration.
- What happens when a returning user signs in again with the same Google account? They must be authenticated into the same existing account, never a duplicate.
- What happens when the country-calling-code submitted during profile completion or update isn't present in the country reference data? The submission must be rejected as invalid.
- What happens when the complete-profile or update-profile submission is retried twice in quick succession (e.g., a double-tap)? The second attempt must not corrupt data or create duplicate records; either it succeeds idempotently or is rejected per the "already complete" / "duplicate number" rules already defined above.
- What happens if the account tied to a valid session no longer exists (deleted between session issuance and a later request)? The system must return a clear not-found style response, not partial or stale data.
- How does the system behave if the observability/tracing export destination is unreachable? It must not crash or block request handling.

## Requirements *(mandatory)*

### Functional Requirements

**Architecture & Persistence**

- **FR-001**: The system MUST organize code into separated domain, application, and infrastructure concerns, mirroring the existing backend's layering, so business rules remain independent of framework and database technical details.
- **FR-002**: The system MUST provide a generic, reusable data-access abstraction exposing at minimum: get all, get by id, add, update, and delete operations, so that any new type of record reuses these operations instead of re-implementing them.
- **FR-003**: The system MUST manage the database connection as a single shared instance for the lifetime of the running service, never recreated per request or per operation.
- **FR-004**: The system MUST obtain database connection details exclusively from environment configuration, never from a source-controlled file, and MUST fail fast with a clear error when that configuration is missing or invalid.
- **FR-005**: When the database becomes unreachable after a successful startup, the system MUST propagate the failure to the caller immediately rather than retrying automatically or hanging.
- **FR-006**: The system MUST persist data in a shape compatible with the existing backend's collections/records (accounts, external identities, renewal credentials, terms-acceptance records, country reference data), so existing data and business meaning carry over without redesign.

**Authentication (Google SSO)**

- **FR-007**: The system MUST provide a capability that returns the SSO providers available to the calling client's platform (mobile or admin web) along with the configuration data needed to start each provider's sign-in flow.
- **FR-008**: The system MUST reject a discovery request that omits the platform indicator or supplies an unrecognized one, rather than defaulting silently.
- **FR-009**: The system MUST provide a capability that accepts the credential produced by Google once a user finishes signing in, and validates its authenticity (signature, issuer, intended audience, expiration) before trusting any identity information it contains.
- **FR-010**: The system MUST reject the exchange and issue no session when the submitted credential fails validation for any reason.
- **FR-011**: Upon successful validation, the system MUST issue a backend-owned session composed of a short-lived access credential and a longer-lived renewal credential.
- **FR-012**: The system MUST require the backend-owned access credential — never the provider's own credential — to authorize access to protected capabilities.
- **FR-013**: The system MUST recognize a returning user by their verified Google identity and authenticate them into the same existing account, never creating a duplicate.
- **FR-014**: When the exchange request originates from the mobile app and no account matches the verified Google identity, the system MUST automatically create a new account and complete the login.
- **FR-015**: When the exchange request originates from the admin web and no existing account carrying administrator status matches the verified Google identity, the system MUST reject the login as unauthorized, creating no account and issuing no session.
- **FR-016**: The system MUST model administrator and regular client accounts as the same underlying account concept, distinguished by an administrator flag, rather than as separate account types.
- **FR-017**: The system MUST provide a renewal capability that accepts a valid, unexpired renewal credential and issues a new access credential without requiring the user to sign in with Google again.
- **FR-018**: The system MUST reject a renewal request bearing an expired, already-used, or unrecognized renewal credential, issuing nothing new.
- **FR-019**: The system MUST NOT provide any mechanism to revoke an access credential before its natural expiration in this scope; access credentials remain short-lived and non-revocable by design.

**Mandatory Profile Completion (Mobile Onboarding)**

- **FR-020**: The system MUST expose a way for the mobile client to determine, immediately after login, whether the authenticated account's profile is already complete.
- **FR-021**: The system MUST require first name, last name, a country calling code, and a WhatsApp number before a profile-completion submission can succeed, and MUST store the country calling code and the WhatsApp number as two distinct values, never concatenated.
- **FR-022**: The system MUST treat the account's email as read-only in the profile-completion capability — sourced from sign-in, never editable through it.
- **FR-023**: The system MUST require explicit acceptance of the Terms & Conditions and Privacy Policy before a profile-completion submission can succeed, and MUST persist a durable, timestamped record identifying the user, the accepted document version(s), and the date/time of acceptance.
- **FR-024**: The system MUST reject a profile-completion submission that is missing or invalid in any required field, clearly indicating what is wrong, and MUST leave the account's profile in its prior "incomplete" state — no partial saves.
- **FR-025**: The system MUST enforce that the combination of country calling code and WhatsApp number is unique across all accounts, rejecting a submission whose number already belongs to a different account, with no data change to either account.
- **FR-026**: The system MUST validate a submitted country calling code against the system's own country reference data, rejecting values not present there.
- **FR-027**: The system MUST accept a profile-completion submission only for an account whose profile is not yet complete; invoking it again for an already-complete profile MUST make no changes and MUST clearly indicate "already complete" rather than silently succeeding or erroring generically.
- **FR-028**: The system MUST block an account with an incomplete profile from any capability that requires a completed profile, consistently, until profile completion succeeds.

**Client Profile View & Update**

- **FR-029**: The system MUST provide a way for a signed-in client to retrieve their own profile: first name, last name, email, WhatsApp number with its country prefix, and account creation date.
- **FR-030**: The system MUST return only the requesting client's own profile data, never another account's, and MUST reject requests with no valid session without disclosing any profile data.
- **FR-031**: When the caller's name or WhatsApp number has not yet been set, the system MUST represent those fields as empty/absent in the profile view rather than failing the request; email and creation date MUST always be present.
- **FR-032**: The system MUST provide a way for a signed-in client to update their own first name, last name, and WhatsApp number (with country prefix), and MUST NOT allow email to be changed through this or any capability introduced by this migration.
- **FR-033**: The system MUST reject a profile update with a blank name or an invalid WhatsApp number format, leaving previously stored values unchanged.
- **FR-034**: The system MUST reject a profile update whose WhatsApp number (with prefix) already belongs to a different account, excluding the caller's own current number from that check, leaving previously stored values unchanged.
- **FR-035**: The system MUST reject a profile update from an account whose profile is not yet complete, directing the caller to complete their profile first via the mandatory profile-completion capability.
- **FR-036**: The system MUST restrict both the profile view and update capabilities to client accounts, rejecting a signed-in administrator account.

**Country Reference Data**

- **FR-037**: The system MUST provide a capability, requiring no authentication, that returns the full country reference catalog (name, dial code, ISO code) for use by any client.

**Health & Observability**

- **FR-038**: The system MUST expose a health-check capability reporting the overall operational status of the service, including the status of the database dependency by name, without exposing internal error detail (connection strings, stack traces, driver messages).
- **FR-039**: The system MUST provide basic request tracing (route, status, duration) for incoming requests without requiring feature-specific instrumentation code, exporting to a configurable destination and falling back to a local/console destination when none is configured.

**Cross-Cutting / Migration Fidelity**

- **FR-040**: The new system MUST reproduce the existing backend's observable behavior (inputs accepted, outputs returned, validation and error outcomes) for every capability in scope, so that existing client applications (mobile app, admin web) can switch to it without client-side changes.
- **FR-041**: The system MUST include an automated test suite covering the repository/persistence abstraction, the authentication flows, the profile-completion flow, the client-profile view/update flow, the country catalog, and the health capability — unit tests (with faked/mocked dependencies) covering business logic and handlers, repository-layer tests verifying this system's own query/update construction and document mapping against a mocked database-driver boundary, and HTTP-level endpoint tests. No automated test may depend on a real or containerized database instance or any other real external resource (Clarifications session 2026-08-30) — every test substitutes a mocked response instead.
- **FR-042**: All source code and documentation produced by this migration MUST be written in English, consistent with the existing backend's convention.

**Security & Error Disclosure**

- **FR-043**: Error responses MUST NOT reveal whether a rejection's underlying reason was "no matching account exists" versus "an account exists but is not authorized/eligible," wherever that distinction could let an outside party enumerate accounts — at minimum: admin-web login rejection, renewal-credential rejection, and the profile-completion "already complete" outcome (which must read identically whether triggered by an already-complete account or a call against a non-existent one).
- **FR-044**: Every capability's error responses MUST express failures as clear, structured outcomes (an error code/message, plus field-level messages for validation failures) and MUST NOT expose internal implementation detail — stack traces, database error messages, or infrastructure configuration values — under any circumstance, not only on the health capability.

### Key Entities

- **User Account**: The central identity record for anyone who can sign in — email (from sign-in, read-only), display name, administrator flag, one or more linked external (Google) identities, first name, last name, country calling code, WhatsApp number, whether the profile is complete, and account creation date. Shared by both mobile clients and the admin web, distinguished only by the administrator flag. The country-calling-code-plus-WhatsApp-number combination is unique across all accounts once set.
- **External Identity**: The link between a User Account and its identity at an external provider (currently Google only) — provider name, the provider's stable subject identifier (the actual matching key), and the email known to the provider at linking time.
- **Renewal Credential**: A longer-lived credential issued alongside every access credential, redeemable exactly once for a new access credential without repeating the Google sign-in flow; rejected once expired, already used, or unrecognized.
- **Terms Acceptance Record**: An append-only, timestamped record proving a specific user accepted a specific version of the Terms & Conditions and Privacy Policy — never edited or deleted after creation, retained as legal evidence.
- **Country**: Reference data — name, dial code, and ISO code for each selectable country — read by profile completion, profile update, and the public country-catalog capability.
- **Health Report**: The structured result of the health capability — overall status plus the status of each checked dependency (currently only the database), with no internal error detail.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every capability currently offered by the existing backend (SSO discovery, credential exchange, session renewal, profile completion, profile view/update, country catalog, health check) is available and behaviorally equivalent on the new stack, verified by exercising each acceptance scenario above.
- **SC-002**: 100% of the automated tests written for this migration pass — unit, repository-layer (mocked database driver, no real resource), and HTTP-level — covering the same scope of behavior as the existing backend's test suite (persistence abstraction, authentication flows, profile completion, client profile, country catalog, health check).
- **SC-003**: Adding data access for a new type of record requires writing zero duplicated code for the common operations (get all, get by id, add, update, delete), since they are inherited/reused from the shared persistence abstraction.
- **SC-004**: 100% of tampered, expired, or wrong-audience credentials submitted to the authentication exchange are rejected with no session issued.
- **SC-005**: A returning user who signs in again with the same Google account is authenticated into the same account 100% of the time — zero duplicate accounts created under test.
- **SC-006**: 100% of newly created mobile accounts are reported as having an incomplete profile until they successfully complete it, and 0% of accounts with an incomplete profile can reach a capability that requires a completed one.
- **SC-007**: 0 accounts ever share the same country-calling-code-plus-WhatsApp-number combination, verified under test including the update-capability's exclude-self behavior.
- **SC-008**: The health capability correctly reflects an unhealthy state within 5 seconds of the database dependency becoming unavailable, and returns to healthy within 5 seconds of the dependency being restored.
- **SC-009**: An existing mobile app or admin web build, pointed at the new backend instead of the old one with no client-side code changes, completes the full sign-in → (profile completion, if needed) → profile view/update journey successfully.
- **SC-010**: 0% of error responses across the system expose internal implementation detail (stack traces, database error messages, configuration values) or distinguish "account not found" from "account exists but unauthorized/incomplete" in a way that would let an outside party enumerate accounts.
- **SC-011**: A client can go from submitting a Google credential to holding a valid internal session in under 10 seconds of backend processing time (excluding time spent on Google's own consent screen), matching the existing backend's commitment.
- **SC-012**: A client whose access credential has expired can obtain a new one using only their renewal credential in under 5 seconds of backend processing time, without contacting Google again, matching the existing backend's commitment.

## Assumptions

- The existing `.NET` backend (`SMC.PorterosPRO.Backend`), including its own four prior feature specifications and the implemented-but-unspecified country-catalog capability, is the authoritative source of truth for this migration's scope and expected behavior; where the existing code and its specs disagree, the code wins.
- This migration targets exact behavioral and contract parity — same capabilities, same accepted inputs, same returned data and error conditions — so that the existing mobile app and admin web can point at the new backend without client-side changes (see FR-040, SC-009). It is a technology port, not an opportunity to change product behavior.
- This is a clean cutover, not a phased/parallel rollout: the new backend is expected to fully replace the .NET backend at deployment. Both backends running simultaneously against production traffic, and sessions/tokens issued by one being valid on the other, are explicitly out of scope — the new backend has no obligation to validate credentials issued by the old one, or vice versa.
- The new backend is expected to work against a database with the same collection/record shape as the existing one (accounts, external identities, renewal credentials, terms-acceptance records, country reference data), so it can either reuse the existing database or a schema-compatible new instance. No data-migration/ETL tooling is in scope for this feature — only shape compatibility is required.
- Administrator accounts continue to be provisioned out-of-band (a manual/ops step outside any API capability), exactly as in the existing backend; this migration introduces no new capability for creating administrator accounts.
- Choice of specific frameworks, libraries, and testing tools within the Express/TypeScript stack (web framework middleware, database driver, JWT library, test runner, mocking approach, etc.) is a planning-phase decision, not fixed by this specification, as long as the resulting behavior satisfies the functional requirements and success criteria above.
- Observability/tracing and the health-check dependency list are limited to the same scope as the existing backend (basic request tracing; database dependency only); expanding either is out of scope for this migration.
- No new business capability, field, or endpoint beyond what the existing backend already provides is in scope for this migration; anything not covered by the existing backend's specs or implemented code is deferred to a future feature.
