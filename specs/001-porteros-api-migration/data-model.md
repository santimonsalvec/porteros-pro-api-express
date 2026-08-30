# Phase 1 Data Model: Migración del Backend PorterosPRO a Express + TypeScript

Every entity and shape below is a direct port of the source `.NET` backend's own data model (consolidated from its `001`–`004` `data-model.md` files and verified against its source code), translated into TypeScript conventions. No new field, entity, or collection is introduced — see spec.md Assumptions ("no new business capability, field, or endpoint... beyond what the existing backend already provides").

## Entity base type (`src/domain/common/entity.ts`)

```ts
abstract class Entity<TId> {
  readonly id: TId;
  equals(other: Entity<TId>): boolean; // true iff same runtime class and same id
}
```

No validation rules or state transitions at this level — concrete entities below extend it.

## `User` (`src/domain/users/user.ts`, MongoDB collection `users`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv7, inherited from `Entity<string>` |
| `email` | `string` | Verified email from the external identity at account-creation time; read-only after creation |
| `displayName` | `string \| null` | Optional, from the provider credential when available |
| `isAdmin` | `boolean` | Distinguishes administrator from regular client; defaults to `false`; no capability in this system sets it to `true` — an admin document is provisioned out-of-band (Clarifications/Assumptions) |
| `externalIdentities` | `ExternalIdentity[]` | One or more linked provider identities; only `"google"` populated |
| `createdAt` | `Date` (stored as BSON date) | Set once at creation |
| `firstName` | `string \| null` | `null` until profile completion |
| `lastName` | `string \| null` | `null` until profile completion |
| `countryCallingCode` | `string \| null` | Dial code (e.g. `"+57"`) resolved server-side from the submitted ISO country code — never trusted directly from the client. `null` until completion. Stored separately from `whatsAppNumber`, never concatenated (FR-021) |
| `whatsAppNumber` | `string \| null` | As submitted (human-readable form retained). `null` until completion |
| `isProfileComplete` | `boolean` | `false` for every newly auto-provisioned account; flips to `true` exactly once via `completeProfile(...)`; never reverts (FR-027, FR-028) |
| `normalizedPhoneNumber` | `string \| null` | Digits-only concatenation of `countryCallingCode` + `whatsAppNumber`, computed by `completeProfile(...)`/`updateProfile(...)`. The actual uniqueness key (FR-025) — not intended for display. `null` until completion |

**Identity & uniqueness rules**:
- `(externalIdentities[].provider, externalIdentities[].subject)` is unique across all `User` documents — enforced via a unique compound index on the embedded array's fields.
- `normalizedPhoneNumber` is unique across all `User` documents once non-null — enforced via a **sparse** unique index (sparse because the field is absent, not `null`, until profile completion; a non-sparse unique index would otherwise treat every absent value as a colliding `null`).

**Domain behavior** (methods on the `User` class):
- `static createFromExternalIdentity(email, displayName, provider, subject, isAdmin = false): User` — factory for mobile auto-provisioning; initializes `firstName`/`lastName`/`countryCallingCode`/`whatsAppNumber`/`normalizedPhoneNumber` to `null` and `isProfileComplete` to `false`.
- `completeProfile(firstName, lastName, countryCallingCode, whatsAppNumber): void` — sets the four profile fields, computes and sets `normalizedPhoneNumber`, sets `isProfileComplete = true`. The *handler* (not this method) enforces "only when not already complete" (FR-027) by checking before calling it — consistent with the source's design of keeping entity methods as simple, unconditional setters.
- `updateProfile(firstName, lastName, countryCallingCode, whatsAppNumber): void` — sets the same four fields and recomputes `normalizedPhoneNumber`; does **not** touch `isProfileComplete`. The handler confirms `isProfileComplete === true` before calling it (FR-035).
- `static normalizePhoneNumber(countryCallingCode, whatsAppNumber): string` — strips every non-digit character from both inputs and concatenates them; used both to set `normalizedPhoneNumber` and by the repository's duplicate-number check (FR-025, FR-034), so `"+57"/"300 123 4567"` and `"57"/"300-123-4567"` collide as the same number despite differing formatting.

**Lifecycle**: Created only via mobile auto-provisioning (FR-014) or out-of-band admin provisioning; never deleted or deactivated by any capability in this system.

## `ExternalIdentity` (`src/domain/users/externalIdentity.ts`, embedded value object)

| Field | Type | Notes |
|---|---|---|
| `provider` | `string` | `"google"` in this scope; shaped to hold other provider names later without a schema change |
| `subject` | `string` | The provider's stable subject identifier (Google ID token's `sub`) — the actual matching key, not the email |
| `email` | `string` | The email claim at the time this identity was linked (may drift from `User.email` if the provider account's email later changes; not reconciled) |

Equality: value-based on `(provider, subject)`.

## `RefreshToken` (`src/domain/users/refreshToken.ts`, MongoDB collection `refreshTokens`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv7, inherited from `Entity<string>` |
| `userId` | `string` | References `User.id` |
| `tokenHash` | `string` | SHA-256 hash of the opaque refresh token value handed to the client; the raw value is never persisted |
| `expiresAt` | `Date` | `createdAt` + configured refresh-token lifetime (env-configurable, default mirrors the source's 30 days) |
| `isUsed` | `boolean` | `true` once redeemed; a used token is rejected on any further redemption attempt (single-use/rotation, FR-018) |
| `createdAt` | `Date` | Set once at creation |

**Domain behavior**: `static create(userId, tokenHash, lifetime): RefreshToken`; `isActive(now: Date): boolean` (`!isUsed && expiresAt > now`); `markUsed(): void`.

**Lifecycle**: Created on every successful exchange (FR-011) and on every successful renewal (rotation — the old record stays, marked `isUsed = true`, for audit; a new record is created). No deletion/TTL cleanup in scope.

## `TermsAcceptance` (`src/domain/users/termsAcceptance.ts`, MongoDB collection `termsAcceptances`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv7 |
| `userId` | `string` | References `User.id` |
| `termsVersion` | `string` | Terms & Conditions version label in effect at acceptance time (env-configurable) |
| `privacyPolicyVersion` | `string` | Privacy Policy version label in effect at acceptance time (env-configurable) |
| `acceptedAt` | `Date` | Set once, at creation — the legally-relevant timestamp (FR-023) |
| `ipAddress` | `string \| null` | Originating request's IP, captured by the controller; `null` if unavailable |
| `userAgent` | `string \| null` | Originating request's `User-Agent` header, captured by the controller; `null` if unavailable |

**Lifecycle**: Created exactly once per successful profile-completion submission (never on the "already complete" no-op path). Append-only — no update or delete operation is ever exposed.

## `Country` (`src/domain/countries/country.ts`, MongoDB collection `Countries` — pre-existing, externally-owned reference data; capitalization preserved exactly)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Tolerates the collection's pre-existing `_id` as either a Mongo `ObjectId` or a `string` — this system only reads it |
| `name` | `string` | BSON field `name` |
| `dialCode` | `string` | BSON field `dialCode`, e.g. `"+57"` |
| `countryCode` | `string` | BSON field `countryCode`, ISO alpha-2, e.g. `"CO"` — the value submitted by clients and looked up server-side (FR-026) |

**Lifecycle**: Owned and maintained entirely outside this system. Read-only: `add`/`update`/`delete` are not offered on this repository's public surface (unlike the generic base, which is not extended for `Country` — mirrors the source, where `CountryRepository` does not extend the generic Mongo repository and throws if a write is attempted).

## Application-layer ports (interfaces; concrete implementations live under `src/infrastructure/`)

| Port | Key members | Backs |
|---|---|---|
| `IRepository<TEntity, TId>` | `getAll()`, `getById(id)`, `add(entity)`, `update(entity)`, `delete(id)` | FR-002 |
| `IUserRepository extends IRepository<User, string>` | `findByExternalIdentity(provider, subject)`; `existsByPhoneNumber(countryCallingCode, whatsAppNumber, excludeUserId?)` | FR-013, FR-025, FR-034 |
| `IRefreshTokenRepository extends IRepository<RefreshToken, string>` | `findActiveByHash(tokenHash)`; `markUsed(id)` | FR-017, FR-018 |
| `ITermsAcceptanceRepository extends IRepository<TermsAcceptance, string>` | (only `add` actually used) | FR-023 |
| `ICountryRepository extends IRepository<Country, string>` | `findByCountryCode(countryCode)` | FR-026, FR-037 |
| `ISsoProviderCatalog` | `getProviders(platform): SsoProviderConfig[]` | FR-007, FR-008 |
| `IGoogleIdTokenValidator` | `validate(credential, platform): Promise<ExternalIdentity \| null>` — `null`, never a thrown error, on any validation failure | FR-009, FR-010 |
| `IInternalTokenIssuer` | `issue(user): TokenPairResponse`; `tryValidateRefreshToken(raw): { tokenHash: string } \| null` | FR-011, FR-017 |

## Application DTOs (mediator command/query shapes — mirrors source `record` DTOs)

**`SsoProviderConfig`**: `{ provider: string; clientId: string; scopes: string[] }`

**`TokenPairResponse`**: `{ accessToken: string; refreshToken: string; expiresInSeconds: number }`

**`CompleteProfileCommand`**: `{ userId: string; firstName: string; lastName: string; countryCode: string; whatsAppNumber: string; acceptedTerms: boolean; ipAddress: string | null; userAgent: string | null }` — `userId` always comes from the authenticated caller's JWT subject claim, never the request body.

**`CompleteProfileOutcome`** (discriminated union tag): `"success" | "validation_failed" | "already_complete" | "invalid_country_code" | "duplicate_phone_number"`

**`ClientProfileResponse`**: `{ firstName: string | null; lastName: string | null; email: string; countryCallingCode: string | null; whatsAppNumber: string | null; createdAt: string }` — produced by a single `ClientProfileResponse.from(user)` projection function reused by both the get and update handlers (mirrors the source's single `ClientProfileResponse.From(User)` factory, so the projection exists in exactly one place).

**`UpdateClientProfileCommand`**: `{ userId: string; firstName: string; lastName: string; countryCode: string; whatsAppNumber: string }`

**`UpdateClientProfileOutcome`**: `"success" | "validation_failed" | "invalid_country_code" | "duplicate_phone_number" | "profile_not_complete" | "not_found"`

**`GetClientProfileOutcome`**: `"success" | "not_found"`

See `contracts/` for the full HTTP request/response shapes and status codes per endpoint.

## Health Report (`src/infrastructure/healthChecks/`)

**`HealthReportResponse`**: `{ status: "Healthy" | "Degraded" | "Unhealthy"; checks: { name: string; status: string }[] }` — this scope registers exactly one check (`"mongodb"`); no exception/description/detail field is ever included (FR-038).
