# Phase 0 Research: Become a Portero — Progressive Registration & Activation

No `NEEDS CLARIFICATION` markers remain in the Technical Context below — every business-facing ambiguity was already resolved in `/speckit.clarify` (see spec.md's Clarifications section: minimum age, document uniqueness, no-edit-once-active + separate draft/profile entities, reused image validation, retained-locked draft). Everything below is a planning-phase design/technology decision, recorded in Decision / Rationale / Alternatives form for auditability, made by reading this codebase's actual conventions (`001-porteros-api-migration`, `002-cloudinary-image-storage` and their implementations) rather than introducing new patterns.

## 1. Two persisted entities, matching the spec's Key Entities split

**Decision**: Two new MongoDB collections — `porteroRegistrations` (one per client, the temporary/draft record) and `porteroProfiles` (created once, at activation, the active/permanent record) — plus a small read-only reference collection `documentTypes`.

**Rationale**: Directly implements the `/speckit.clarify` Q3/Q5 resolution: the registration is a draft whose data-entry capability stops at activation but which is *retained, locked* afterward as a historical/audit trail (FR-026) — it is not deleted or morphed in place. A separate `PorteroProfile` is what a future search/discovery feature would query (FR-017); this plan creates that record but does not add a public search/browse endpoint for it (spec Assumptions: search/matching is out of scope).

**Alternatives considered**: A single collection with a `status` field toggled to `'active'` at activation — rejected, because it conflates "the draft that must stay locked/immutable forever once consumed" with "the thing a future feature will read/manage," and would force that future feature to defend against ever accidentally reading/writing draft-only fields (`documentPhotoAId` mid-upload, etc.). Two collections keep each one's contract simple and match the clarification's explicit wording ("una entidad aparte... la función de activar debe tomar estos datos desde DB y usarlos para registrar el portero").

## 2. Route shape

**Decision**: `POST/GET/PATCH` family under `/api/porteros/me` (mirrors `/api/clients/me`'s `/me`-for-current-user convention):

- `GET /api/porteros/me`
- `PATCH /api/porteros/me/identification`
- `PATCH /api/porteros/me/physical-data`
- `PATCH /api/porteros/me/location`
- `PATCH /api/porteros/me/availability`
- `POST /api/porteros/me/document-photo` (multipart, fields `sideA`/`sideB`, each optional)
- `POST /api/porteros/me/activate`
- `POST /api/porteros/me/cancel`
- `GET /api/porteros/document-types` (public reference data, no auth — mirrors `/api/locations/countries`)

**Rationale**: `porteros` (left untranslated, like the pre-existing `clients` resource keeps its English name despite the Spanish-language product) is the new top-level resource, `/me` matches the established "current authenticated user's own resource" convention (research from `/speckit.clarify` session). Section names are English nouns, consistent with the rest of this API's route vocabulary (`clients`, `locations`, `profile`) even though the product's UI text is Spanish.

**Alternatives considered**: A single `PATCH /api/porteros/me` accepting any subset of fields across all four sections at once, as originally sketched in the feature's Input — rejected in favor of one endpoint per section (§3 below).

## 3. One command per section, each still accepting a partial field subset

**Decision**: Four distinct, fully-typed commands (`SaveIdentificationSectionCommand`, `SavePhysicalDataSectionCommand`, `SaveLocationSectionCommand`, `SaveAvailabilitySectionCommand`), one per `PATCH` route. Within a single command, every field stays *optional* — only fields actually present in the request are validated and merged into the stored section; absent fields are left untouched (preserves the "save what you have" premise from the original request, just scoped to one section per call instead of any-section-in-one-call).

**Rationale**: Every existing command in this codebase (`UpdateClientProfileCommand`, `CompleteProfileCommand`, `StoreImageCommand`) takes a fully-typed, non-generic parameter list — there's no existing "arbitrary partial merge across unrelated field groups" precedent to extend, and the four sections are naturally disjoint field groups (confirmed against the actual UI mockups, each section is its own screen with its own save action). Splitting by section keeps each command's zod request schema and validation function small and focused, matching `updateClientProfileRequestSchema`'s style.

**Alternatives considered**: The single generic `PATCH /api/porteros/me` from the original Input — rejected per above; a single command with four optional nested objects (`identification?`, `physicalData?`, ...) dispatched from one route — rejected as a needless generic layer over what four small, explicit routes already express clearly, and it would let a single request mix validation errors from unrelated sections in one response, complicating the field-error contract.

## 4. No new JWT claim for portero status — every gate is a live database check

**Decision**: The access token (`AccessTokenClaims` / `jwtInternalTokenIssuer.ts`) is **not** changed. Nothing about portero status is added to it. Every place that must know "is this registration already active" (all four section-save commands, the document-photo command, activate, cancel) checks `PorteroRegistration.status` freshly from the database inside its own handler.

**Rationale**: This mirrors an existing, exact precedent in this codebase: `CompleteProfileCommandHandler` doesn't trust anything in the JWT to decide `already_complete` — it re-reads `user.isProfileComplete` from the repository on every call, precisely because a JWT claim issued before a state change would be stale until the next token refresh. Portero activation has the same shape (a state change during an already-issued token's lifetime), so the same live-check pattern applies. This also means activation needs **no token reissuance** — resolving the open question the original feature Input explicitly deferred to planning ("decide si el rol portero debe reflejarse en el JWT... o si se resuelve consultando este recurso en cada request").

**Alternatives considered**: Adding an `isPortero`/`porteroStatus` claim and reissuing tokens on activation (mirroring how `CompleteProfileCommand` *does* reissue tokens, because profile completion changes `profileComplete`, a claim genuinely used by `requireCompleteProfile()` middleware) — rejected: portero status isn't checked by any Express *middleware* gate in this design (§6), only inside individual command handlers, so there is no cheap-JWT-check use case that would justify the added complexity of token reissuance and a new claim.

## 5. Document photos reuse the existing image feature's commands as-is, via the mediator

**Decision**: A new `SaveDocumentPhotoCommandHandler` does not talk to Cloudinary or `IImageRepository` directly. It depends only on `ISender` (the mediator) and:
1. Sends `StoreImageCommand(userId, buffer, contentType)` for the newly uploaded side.
2. On success, reads the current registration; if that side already had a `StoredImage` id, sends `DeleteImageCommand(userId, oldImageId)` for the old one — **after** the new upload has already succeeded, never before (so a failed re-upload never leaves the client with zero photos for that side).
3. Sets the new id on the registration (`documentPhotoAId`/`documentPhotoBId`) and persists it.

The controller layer (`porterosController.ts`) does its own `multer` + `file-type` content-sniffing exactly like `imagesController.ts` already does, for each of the (up to two) files present in the multipart request, before dispatching a `SaveDocumentPhotoCommand` per accepted file.

**Rationale**: `DeleteImageCommandHandler` already authorizes by `image.uploadedBy === command.userId`, which holds here since the portero and the uploader are the same account — no new authorization code is needed. This is exactly the composition model `002`'s spec Assumptions anticipated ("a future feature that attaches a `StoredImage` id to their own entity... layer their own resource-level authorization on top"), and it means zero new dependency on Cloudinary/`file-type`/`multer` internals beyond what `002` already wired into `di.ts`.

**Alternatives considered**: Having `SaveDocumentPhotoCommandHandler` depend directly on `IImageStorageProvider`/`IImageRepository` (bypassing the mediator) — rejected, unnecessarily duplicates upload/delete logic that already exists as reusable commands, and loses the "one place uploads happen" property that keeps `002`'s compensating-delete-on-DB-failure logic (research.md §5 of `002`) as the single source of truth for upload consistency.

## 6. Access control on the new router

**Decision**: `router.use(requireAuth(deps.verifyAccessToken), requireClientOnly(), requireCompleteProfile())` applied to the entire `/api/porteros` router (all routes, including `GET /me`) — the one route intentionally left outside this router, `GET /api/porteros/document-types`, requires no auth at all (mirrors `/api/locations/countries`).

**Rationale**: Unlike `/api/clients/me` (where `GET` must stay reachable even with an incomplete profile, since completing the profile is itself the point of that flow), becoming a portero is an explicitly secondary, opt-in flow a client only reaches after they already have a complete client profile (spec Assumptions: "requires an existing, authenticated client profile as a prerequisite"). There's no scenario where a client needs to see `GET /api/porteros/me` before their own client profile is complete, so gating the whole router uniformly is simpler than replicating `clientsController`'s per-route nuance without a reason to.

**Alternatives considered**: Omitting `requireCompleteProfile()` and letting an incomplete-profile client start a portero registration anyway — rejected, contradicts the stated precondition and would require this feature to separately re-validate client-profile completeness deep in a handler instead of at the router edge, where the existing middleware already does it for free.

## 7. Document type validation: reference-data lookup, not a hardcoded enum

**Decision**: `documentType` is validated by looking it up in the new `documentTypes` collection (`DocumentTypeRepository.findByCode(code)`), returning `invalid_document_type` when not found — not a static TypeScript union/zod enum baked into request validation.

**Rationale**: Mirrors `CompleteProfileCommandHandler`'s `countryRepository.findByCountryCode(...)` → `invalid_country_code` pattern exactly, for the same reason: the three accepted values are manually administered reference data (per the feature's own request — the user asked for a JSON object to seed manually, exactly as `Countries` is seeded), not a compile-time constant. A future fourth document type can be added by inserting a row, with no code change, consistent with how `Countries` already works in this system.

**Alternatives considered**: A hardcoded zod `z.enum([...])` at the request-schema layer — rejected, would require a code deploy to add or rename a document type and diverges from this codebase's own precedent for reference data.

## 8. Document number uniqueness: pre-check + defense-in-depth unique index

**Decision**: `PorteroRegistrationRepository.existsByDocument(documentType, documentNumber): Promise<boolean>` — a pre-check query the identification-section handler calls (returning `duplicate_document` if true) whenever, after merging the incoming request into the stored section, *both* `documentType` and `documentNumber` end up present (whether both arrived in this request or one was already saved earlier). A sparse unique compound index on `(identification.documentType, identification.documentNumber)` is also added to the `porteroRegistrations` collection as a safety net against a race between two concurrent requests, mirroring `normalizedPhoneNumber`'s sparse unique index + `existsByPhoneNumber` pre-check dual approach on `User`.

**Rationale**: Exact precedent: `CompleteProfileCommandHandler` does `userRepository.existsByPhoneNumber(...)` as an application-level pre-check, backed by a database-level sparse unique index for the genuinely-concurrent case — not a caught duplicate-key-error code path. Following the same shape keeps this feature's error handling consistent with the rest of the codebase (a clear `409 duplicate_document`, not a leaked driver error).

**Alternatives considered**: Relying solely on catching the MongoDB duplicate-key error (code `11000`) from `add`/`update` — rejected, `MongoRepository`'s base class deliberately lets driver failures propagate untranslated ("no retry logic" — `mongoRepository.ts`), so translating a raw duplicate-key error into a domain outcome would mean either breaking that base class's contract or duplicating translation logic per-repository; the pre-check keeps the common path clean and matches the one precedent this codebase already has for a uniqueness rule.

## 9. Section completeness computed at read time, not stored

**Decision**: A single pure function `computePorteroSections(registration): PorteroSectionsView` (in `application/features/porteros/common/`) derives `{ identification: {complete}, physicalData: {complete}, location: {complete}, availability: {complete} }` from the raw stored field values. Both `GetPorteroRegistrationQueryHandler` (for the `GET` response) and `ActivatePorteroCommandHandler` (to decide whether activation is allowed, and to build `missingSections`) call this same function — completeness is never itself persisted as a boolean.

**Rationale**: Avoids a second source of truth that could drift from the actual field values (e.g., a stale "complete" flag after a bug elsewhere) — recomputing from raw data on every read is cheap here (a handful of fields, no aggregation) and removes an entire class of consistency bug.

**Alternatives considered**: Storing a `sectionsComplete: {...}` boolean map on the entity, updated by every setter — rejected as redundant state with no read-performance justification at this scale.

## 10. `not_started` is synthesized, never written

**Decision**: `PorteroRegistration.status` is only ever persisted as `'in_progress'` or `'active'`. When `GetPorteroRegistrationQueryHandler` finds no document for a `userId`, it returns a synthesized response with `status: 'not_started'` and every field `null`/`false` — no database write happens on a `GET`. The registration document itself is created (upserted) lazily, the first time any section-save command succeeds for that user.

**Rationale**: Keeps `GET` a true read with no side effect, and avoids ever needing to reconcile "not_started" as a real stored state distinct from "the document doesn't exist yet" — they're the same thing by construction.

**Alternatives considered**: Eagerly creating an empty `in_progress`-like row the first time a client visits the registration screen — rejected, adds a write for what is otherwise a pure `GET`, and provides no benefit since the first section save already upserts the row lazily.

## 11. Reused conventions carried over unchanged

- **Id generation**: `IIdGenerator` / `UuidIdGenerator` (UUIDv7), same as every other entity (`User`, `StoredImage`, `TermsAcceptance`) — no new id scheme.
- **Repository base**: `MongoRepository<TEntity, TId>` for `porteroRegistrations` and `porteroProfiles`; `documentTypes` follows `CountryRepository`'s plain read-only pattern instead (write methods throw, matching "this system only reads it").
- **Error shape**: `ApiError(statusCode, code, message, fieldErrors?)` throughout — `validation_failed` (400) for field errors, specific codes (`portero_profile_incomplete`, `duplicate_document`, `already_active`, `invalid_document_type`) for business-rule 409/400s, exactly matching `/api/clients/me`'s existing contract.
- **Image validation limits**: `IMAGE_MAX_UPLOAD_SIZE_BYTES` / the JPEG-PNG-WEBP-HEIC-HEIF allow-list already in `config.images` and `imagesController.ts` — reused as-is (per `/speckit.clarify` Q4), no portero-specific override or new env var.
- **Test tiers**: `tests/unit/application/features/porteros/*.test.ts` (handlers against hand-written fakes/mocked repositories), `tests/http/controllers/porteros*.test.ts` (supertest against the new router, fake-backed), `tests/fakes/fakePorteroRegistrationRepository.ts` etc. — same three-tier convention as `001`/`002`.
