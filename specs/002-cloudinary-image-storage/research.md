# Phase 0 Research: Cloudinary Image Storage Integration

No `NEEDS CLARIFICATION` markers remained in the Technical Context after drafting it. The two business-facing ambiguities (access control, link lifetime) were already resolved in `/speckit.clarify` (see spec.md's Clarifications section); everything below is a planning-phase technology/design choice, still recorded in Decision / Rationale / Alternatives form for auditability.

## 1. Storage provider SDK

**Decision**: Official `cloudinary` npm package, v2.x (`cloudinary.v2.uploader.upload_stream` / `destroy`).

**Rationale**: It's Cloudinary's own maintained Node SDK — direct parity with "integrate Cloudinary as the storage provider" from the spec's Input, and it exposes upload-time transformation options needed for FR-002 (see §4) in a single call, without hand-rolling REST requests/signatures.

**Addendum (post-implementation)**: Credentials are read from the single `CLOUDINARY_URL` environment variable (`cloudinary://<api_key>:<api_secret>@<cloud_name>`) that Cloudinary's own dashboard issues, not three separate `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` variables as originally planned. The SDK's `cloudinary.config()` already parses `CLOUDINARY_URL` from `process.env` on first call; `CloudinaryImageStorageProvider.configure()` only calls `config.images.cloudinaryUrl()` first, to fail fast with this codebase's standard clear error if it's unset, then lets the SDK do the actual parsing rather than duplicating it.

**Alternatives considered**: Raw REST calls against Cloudinary's Upload API via `fetch` — rejected, would mean re-implementing request signing, retry semantics, and multipart encoding the SDK already provides for no fidelity gain.

## 2. Multipart/form-data parsing

**Decision**: `multer` v2.x, configured with `memoryStorage()` and `limits.fileSize` set from `IMAGE_MAX_UPLOAD_SIZE_BYTES`.

**Rationale**: Express (4 or 5) does not parse `multipart/form-data` itself — some middleware is required to receive an uploaded file as a buffer before it can be handed to the Cloudinary SDK. `multer` is the de facto standard for Express, has no Express-version-specific peer dependency (confirmed compatible with Express 5), and its `memoryStorage` engine avoids ever touching disk — the buffer goes straight from the request into the upload call. Its built-in `limits.fileSize` rejects an oversized file before the provider is ever contacted (FR-010), and a very old CVE line (1.x, unbounded field/part counts) is avoided by pinning the 2.x major, which fixed it.
**Note**: 2.x is a breaking-change major relative to the widely-copied 1.x tutorials online; API used here (`multer({ storage, limits })`, `.single('image')`) is stable across both, so this is a non-issue in practice.

**Alternatives considered**: `busboy` (multer's own lower-level dependency) directly — rejected, would mean re-implementing the field-parsing/limit-enforcement wrapper multer already provides; `formidable` — rejected, no particular advantage over the already-ubiquitous multer for this project's single-file-field use case.

## 3. Content-based image validation

**Decision**: `file-type` v22.x, used to sniff the actual file signature (magic bytes) of the uploaded buffer and compare the detected MIME type against an allow-list, independent of the client-supplied `Content-Type` or filename extension.

**Rationale**: Directly satisfies the spec's edge case "a file that matches an accepted format's extension but isn't actually an image... must be rejected based on actual content, not just file name." `multer`'s own `fileFilter` only sees the client-asserted MIME type/extension, which is trivially spoofable — `file-type` reads the real bytes. v22 is ESM-only, which matches this project's `"type": "module"` setting, and requires Node ≥22 — already satisfied by this project's Node 24 target.

**Alternatives considered**: Trusting `multer`'s `fileFilter`/`mimetype` alone — rejected, doesn't satisfy the content-based edge case; a full image-decoding library (e.g., `sharp`) just to validate — rejected as disproportionate (FR-011's spirit: don't reach for more provider/library capability than storage needs), `file-type`'s signature check is the minimal sufficient check.

## 4. Where optimization happens (FR-002)

**Decision**: Pass an upload-time incoming transformation to Cloudinary — `quality: 'auto', fetch_format: 'auto'` — as part of the `upload_stream` call, so Cloudinary itself re-encodes the asset before it is stored. The `bytes`/`format`/`width`/`height` recorded on the `StoredImage` come from Cloudinary's own upload response for that already-optimized asset, not the original upload.

**Rationale**: The spec is explicit that "the optimization should be resolved within the provider implementation... using the provider's own services" and that this system should not build a custom image-processing pipeline. Cloudinary's `q_auto`/`f_auto` are exactly that — a provider-native capability, not a "transformation feature" in the on-demand/editing sense FR-011 excludes (no crop/effects/on-the-fly derived variants are requested or exposed); this is a one-time encoding decision made at storage time, functionally equivalent to "save this file efficiently," which is what storage-related optimization means for this feature.

**Alternatives considered**: Storing the raw original and applying `q_auto,f_auto` only as a URL parameter at *delivery* time — rejected, because the spec asks the system to "conserve the images but optimized in weight" (i.e., the stored asset's footprint should actually be reduced, not just its delivery instance), and recording accurate `bytes` on the `StoredImage` record is simpler when it is the actual stored size, not a delivery-time-only number that depends on parameters not persisted anywhere; running a local re-encode (e.g., `sharp`) before upload — rejected per the spec's explicit preference for the provider doing this.

## 5. Consistency between the provider and the database record (FR-012)

**Decision**: `storeImageCommandHandler` uploads to Cloudinary first; if the subsequent `imageRepository.add(...)` write fails, the handler calls `imageStorageProvider.delete(externalId)` as a best-effort compensating action before re-throwing, so no file is left at the provider without a matching record. The reverse case (record without a file) cannot happen by construction, since the record is only ever constructed from a successful upload's response.

**Rationale**: This codebase has no distributed-transaction/outbox infrastructure, and the spec doesn't ask for one — a straightforward compensating action on the single failure path that can produce an inconsistency is proportionate and matches the project's existing "no retry logic, let failures propagate" convention (`mongoRepository.ts`) while still satisfying FR-012's "MUST prevent."

**Alternatives considered**: A background reconciliation job that periodically diffs Cloudinary assets against `images` documents — rejected as disproportionate infrastructure for a foundational, low-volume-so-far capability; wrapping the two calls in a two-phase-commit-style saga — rejected, no such infrastructure exists elsewhere in this codebase and the compensating-delete approach already closes the gap for the realistic failure mode (a transient Mongo write error immediately after a successful upload).

## 6. Access control on this feature's own endpoints

**Decision**: `/api/images` requires `requireAuth`; `GET /api/images/:id` and `DELETE /api/images/:id` additionally require the resolved `StoredImage.uploadedBy` to equal the caller's `authClaims.sub`, returning `403 forbidden` otherwise (`404 not_found` when the id simply doesn't exist).

**Rationale**: Spec Assumptions state this feature "does not define how any specific business feature associates itself with a stored image... that same feature is responsible for enforcing which requesters may see the resulting image." Since no such consuming feature exists yet in this codebase, "uploader-only" is the narrowest authorization rule consistent with FR-005/FR-008 that still makes User Stories 2 and 3 independently demonstrable over HTTP today, without inventing a broader sharing/roles model the spec never asked for. A future feature that attaches a `StoredImage` id to its own entity (e.g., an identity-document field on a person) is expected to do its own authorization check using its own resource's rules and call `resolveImage`/`deleteImage` on the caller's behalf rather than relying on this endpoint's uploader-only rule.

**Alternatives considered**: No ownership check at all (any authenticated user can resolve/delete any image) — rejected, directly contradicts FR-008 and the Clarifications session's premise that sensitive content (e.g., identity documents) needs per-resource authorization; a full roles/sharing model — rejected as speculative, nothing in the spec asks for it yet.

## 7. Returned image location

**Decision**: Return Cloudinary's `secure_url` (HTTPS) for the optimized asset as-is, unmodified — no signed-URL/expiring-token wrapper.

**Rationale**: Directly implements the `/speckit.clarify` Q2 resolution: the link is stable and indefinitely valid once obtained through an authorized response; protection lives in the authentication/authorization check performed before it is handed out (§6), not in the link itself expiring.

**Alternatives considered**: Cloudinary signed delivery URLs / authenticated delivery type — rejected per the explicit clarification answer (adds expiry-management complexity the user chose not to take on).

## 8. Defaults carried from spec.md Assumptions

**Decision**: `IMAGE_MAX_UPLOAD_SIZE_BYTES` env var, default `10485760` (10 MB); allowed content types `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`.

**Rationale**: Matches spec.md's documented Assumptions verbatim; kept environment-configurable (mirroring `config.ts`'s existing `optionalEnv` pattern for every other tunable) so the provisional 10 MB figure can be revisited without a code change.

## 9. Entity id generation

**Decision**: Reuse the existing `IIdGenerator` port / `UuidIdGenerator` (UUIDv7) already wired in `di.ts` — no new id-generation code.

**Rationale**: Consistent with every other entity in this codebase (`User`, `RefreshToken`, `TermsAcceptance`); `StoredImage.id` is a UUIDv7 string, distinct from Cloudinary's own `public_id` (stored separately as `externalId`, per FR-004's "not coupled to the provider's response").

## 10. Mongo collection naming

**Decision**: New collection `images`, lower-case, matching the naming convention for every collection introduced by this backend itself (`users`, `refreshTokens`, `termsAcceptances`) — the one exception, `Countries`, is capitalized only because it's a legacy collection this backend reads as-is, which doesn't apply here.
