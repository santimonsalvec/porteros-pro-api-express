# Phase 1 Data Model: Cloudinary Image Storage Integration

## `StoredImage` (`src/domain/images/storedImage.ts`, MongoDB collection `images`)

A generic, provider-independent record of one image the system has stored (spec Key Entities). Every field exists to serve one of: referencing the image, displaying it, or managing it later (FR-004) — nothing from Cloudinary's own upload response is carried over beyond that.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv7, inherited from `Entity<string>`; this system's own identifier, independent of Cloudinary's `public_id` |
| `externalId` | `string` | Cloudinary's `public_id` for the stored asset — needed to manage the file at the provider later (retrieve/delete), never exposed to callers of this feature's own DTOs |
| `url` | `string` | The optimized asset's `secure_url` as returned by Cloudinary at upload time (research.md §4, §7) — a stable link once handed out, not re-generated on each read |
| `format` | `string` | The stored (post-optimization) file format, e.g. `"jpg"`, `"webp"` — reflects `fetch_format: 'auto'`'s actual outcome, not the originally uploaded format |
| `bytes` | `number` | The stored (post-optimization) file size in bytes — what SC-002 is measured against |
| `width` | `number` | Pixel width of the stored asset |
| `height` | `number` | Pixel height of the stored asset |
| `uploadedBy` | `string` | References the uploading user's id (`User.id`) — the authorization anchor for this feature's own endpoints (research.md §6) and for future features to build on |
| `createdAt` | `Date` (stored as BSON date) | Set once, at successful storage |

**Identity & uniqueness rules**: `id` is the primary key (`_id` in MongoDB), unique by construction (UUIDv7). No uniqueness constraint on `externalId` is enforced at the database level — one-to-one with the underlying Cloudinary asset is guaranteed by construction (each successful upload creates exactly one `StoredImage`, FR-003), not by an index.

**Domain behavior** (methods on the `StoredImage` class):
- `static create({ id, externalId, url, format, bytes, width, height, uploadedBy }): StoredImage` — the only way to construct one; there is no partial/incomplete `StoredImage` (mirrors the source-adjacent convention in `001` of simple, unconditional entity constructors — validation and existence checks live in the handler, not the entity).
- No mutating methods — a `StoredImage` is immutable once created; "editing" an image is out of scope (FR-011), and deletion removes the record entirely rather than transitioning its state.

**Lifecycle**: Created exactly once, on a successful `StoreImageCommand` (upload succeeded at the provider AND the record was persisted — FR-003, FR-012). Permanently removed on a successful `DeleteImageCommand` (FR-007). No update/edit path exists at any point in its lifecycle.

**Relationship to other entities**: None *from* `StoredImage` — it does not reference the resource(s) that use it (Key Entities: "deliberately excludes... fields that don't serve one of those needs"). Other entities (existing, e.g. `User`, or future, e.g. an identity-document field) are expected to hold a `StoredImage.id` value themselves; that reference — and the authorization it implies — lives entirely on the referencing side, not here.

## Provider-facing shape (not persisted, not an entity)

The result Cloudinary's SDK returns from an upload is translated at the infrastructure boundary (`CloudinaryImageStorageProvider`) into a plain shape consumed by the application layer:

```ts
interface ProviderUploadResult {
  externalId: string; // public_id
  url: string;         // secure_url
  format: string;
  bytes: number;
  width: number;
  height: number;
}
```

This shape — not Cloudinary's full raw response (`asset_id`, `version`, `signature`, `tags`, `resource_type`, `type`, `etag`, …) — is all `storeImageCommandHandler` ever sees, which is what makes `StoredImage` provider-independent (FR-004) in practice, not just by field selection at write time.
