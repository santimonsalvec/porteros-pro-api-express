# Phase 1 Data Model: Become a Portero — Progressive Registration & Activation

## `PorteroRegistration` (`src/domain/porteros/porteroRegistration.ts`, MongoDB collection `porteroRegistrations`)

The temporary/draft record tracking one client's progressive path toward becoming a portero (spec Key Entities). Its data-entry capability exists only up to activation; once activated it is retained, permanently locked, as a historical/audit trail (`/speckit.clarify` Q3, Q5 — FR-024, FR-025, FR-026).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv7, inherited from `Entity<string>` |
| `userId` | `string` | References `User.id` — the owning client. Unique across this collection (one registration per client, research.md §11) |
| `status` | `'in_progress' \| 'active'` | Only these two values are ever persisted — `'not_started'` is synthesized at read time when no document exists (research.md §10). Set to `'active'` exactly once, by `ActivatePorteroCommandHandler`, and never reverted |
| `identification.documentType` | `string \| null` | A `DocumentType.code` value, validated against the reference collection (research.md §7); `null` until saved |
| `identification.documentNumber` | `string \| null` | Trimmed, non-empty when present |
| `identification.issueDate` | `Date \| null` (stored as BSON date) | Document issue date; not future, not before `birthDate` |
| `identification.birthDate` | `Date \| null` (stored as BSON date) | Not future; client must be ≥ 18 years old (`/speckit.clarify` Q1, FR-011) |
| `identification.documentPhotoAId` | `string \| null` | References a `StoredImage.id` (feature `002`) for document side A |
| `identification.documentPhotoBId` | `string \| null` | References a `StoredImage.id` for document side B |
| `physicalData.heightCm` | `number \| null` | 120–230 |
| `physicalData.weightKg` | `number \| null` | 40–150 |
| `location.latitude` | `number \| null` | -90 to 90 |
| `location.longitude` | `number \| null` | -180 to 180 |
| `location.city` | `string \| null` | Non-empty when present |
| `location.state` | `string \| null` | Non-empty when present |
| `location.country` | `string \| null` | ISO country code (e.g. `"CO"`), non-empty when present |
| `location.neighborhood` | `string \| null` | Optional; doesn't affect section completeness |
| `location.formattedAddress` | `string \| null` | Internal verification use only (FR-018, FR-021) — never included in any response DTO this feature returns, including to the owning client themselves |
| `availability.radiusKm` | `number \| null` | Integer, 10–50 |
| `createdAt` | `Date` | Set once, when the document is first upserted by the first successful section save |
| `updatedAt` | `Date` | Set on every successful section save or photo change |
| `activatedAt` | `Date \| null` | Set once, by `ActivatePorteroCommandHandler`; `null` while `status !== 'active'` |

**Identity & uniqueness rules**:
- `id` is the primary key (`_id`), unique by construction (UUIDv7).
- `userId` unique index — one `PorteroRegistration` per client, ever (even after cancellation and restart, the same document is reused/recreated fresh; a client never has two).
- Sparse unique compound index on `(identification.documentType, identification.documentNumber)` — enforced whenever both are non-null, across every registration regardless of `status` (research.md §8, FR-023). Sparse so two registrations that both still have `null` document fields never collide.

**Domain behavior** (methods on the `PorteroRegistration` class, following this codebase's convention of simple, unconditional setters — the *handler* enforces `status !== 'active'` before calling any of these, mirroring `User.completeProfile`/`updateProfile`):
- `static createEmpty(id, userId): PorteroRegistration` — factory for the first section save; all section fields `null`, `status: 'in_progress'`.
- `saveIdentification(fields: Partial<{documentType, documentNumber, issueDate, birthDate}>): void` — merges only the provided keys.
- `savePhysicalData(fields: Partial<{heightCm, weightKg}>): void`
- `saveLocation(fields: Partial<{latitude, longitude, city, state, country, neighborhood, formattedAddress}>): void`
- `saveAvailability(fields: Partial<{radiusKm}>): void`
- `setDocumentPhoto(side: 'A' | 'B', imageId: string): void`
- `sections(): PorteroSectionsView` — thin wrapper calling the shared `computePorteroSections` pure function (research.md §9) over `this`.
- `isComplete(): boolean` — `true` iff all four of `sections()`'s `complete` flags are `true`.
- `activate(): void` — sets `status = 'active'`, `activatedAt = new Date()`. The handler calls this only after confirming `isComplete()`.

**Lifecycle**: Created (upserted) on the first successful section save for a client. Mutated by any subsequent section save or document-photo change while `status === 'in_progress'`. Transitions to `status: 'active'` exactly once, via `activate()`, at which point it becomes permanently read-only (every command handler that would mutate it checks `status !== 'active'` first and returns an `already_active` outcome otherwise). Deleted entirely only by a successful `CancelPorteroRegistrationCommand`, and only while `status === 'in_progress'`.

## `PorteroProfile` (`src/domain/porteros/porteroProfile.ts`, MongoDB collection `porteroProfiles`)

The active, permanent record establishing a client as a discoverable portero (spec Key Entities), created from a `PorteroRegistration`'s completed data at the moment of activation.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv7 |
| `userId` | `string` | References `User.id`. Unique — one active profile per client |
| `documentType` | `string` | Copied from the registration at activation (guaranteed non-null — activation requires completeness) |
| `documentNumber` | `string` | Copied |
| `issueDate` | `Date` | Copied |
| `birthDate` | `Date` | Copied |
| `documentPhotoAId` | `string` | Copied — the same `StoredImage.id`, not a duplicated file |
| `documentPhotoBId` | `string` | Copied |
| `heightCm` | `number` | Copied |
| `weightKg` | `number` | Copied |
| `latitude` | `number` | Copied |
| `longitude` | `number` | Copied |
| `city` | `string` | Copied |
| `state` | `string` | Copied |
| `country` | `string` | Copied |
| `neighborhood` | `string \| null` | Copied (was optional) |
| `formattedAddress` | `string \| null` | Copied — internal use only; a future search feature built on this collection must not surface it either (FR-018) |
| `radiusKm` | `number` | Copied |
| `activatedAt` | `Date` | Set once, at creation |

**Identity & uniqueness rules**: `id` primary key; unique index on `userId`.

**Domain behavior**: `static createFromRegistration(id, registration): PorteroProfile` — the only constructor; reads every field off a `PorteroRegistration` whose `isComplete()` is `true`. No mutating methods — updating an active profile's data is explicitly out of scope for this feature (spec Assumptions; FR-024 only governs the registration's own routes, but no route in this plan writes to `PorteroProfile` after creation either).

**Lifecycle**: Created exactly once, by `ActivatePorteroCommandHandler`, in the same logical operation as flipping the source `PorteroRegistration.status` to `'active'`. Never updated or deleted by any capability in this plan (out of scope: active-profile management, per spec Assumptions).

## `DocumentType` (`src/domain/porteros/documentType.ts`, MongoDB collection `documentTypes` — new, manually seeded reference data, read-only from this system's perspective, mirrors `Countries`/`Country`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Arbitrary stable id (mirrors `Country`'s tolerance for a pre-existing `_id`) |
| `code` | `string` | The enum-like value clients submit as `identification.documentType`, e.g. `"cedula_ciudadania"` |
| `name` | `string` | Display name for client applications, e.g. `"Cédula de ciudadanía"` |

**Seed data** (to be inserted manually, same as `Countries` — see quickstart.md):

```json
[
  { "code": "cedula_ciudadania", "name": "Cédula de ciudadanía" },
  { "code": "cedula_extranjeria", "name": "Cédula de extranjería" },
  { "code": "pasaporte", "name": "Pasaporte" }
]
```

**Domain behavior**: `DocumentTypeRepository.findByCode(code): Promise<DocumentType | null>` (mirrors `CountryRepository.findByCountryCode`) and `getAll(): Promise<DocumentType[]>` (backs `GET /api/porteros/document-types`). `add`/`update`/`delete` throw, matching `CountryRepository`'s "read-only in this system" contract.

## Section-completeness view (not persisted — a computed DTO)

```ts
interface PorteroSectionsView {
  identification: { complete: boolean };
  physicalData: { complete: boolean };
  location: { complete: boolean };
  availability: { complete: boolean };
}
```

Produced by the pure function `computePorteroSections(registration: PorteroRegistration): PorteroSectionsView` (research.md §9):
- `identification.complete` — `true` iff `documentType`, `documentNumber`, `issueDate`, `birthDate`, `documentPhotoAId`, and `documentPhotoBId` are all non-null.
- `physicalData.complete` — `true` iff `heightCm` and `weightKg` are both non-null.
- `location.complete` — `true` iff `latitude`, `longitude`, `city`, `state`, and `country` are all non-null (`neighborhood` and `formattedAddress` excluded — optional/internal, FR-007).
- `availability.complete` — `true` iff `radiusKm` is non-null.

## Response DTO (`src/application/features/porteros/common/porteroRegistrationResponse.ts`)

The shape every section-save command, `GET`, `activate`, and `cancel` return (recomputed fresh each time, never cached):

```ts
interface PorteroRegistrationResponse {
  status: 'not_started' | 'in_progress' | 'active';
  sections: PorteroSectionsView;
  documentType: string | null;
  documentNumber: string | null;
  issueDate: string | null; // ISO date
  birthDate: string | null; // ISO date
  documentPhotoASubmitted: boolean; // derived: documentPhotoAId !== null
  documentPhotoBSubmitted: boolean;
  heightCm: number | null;
  weightKg: number | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  neighborhood: string | null;
  radiusKm: number | null;
}
```

`formattedAddress` and the raw `documentPhotoAId`/`documentPhotoBId` values are deliberately never included (FR-018, FR-021; research.md's response-shape decision) — only the booleans derived from them.
