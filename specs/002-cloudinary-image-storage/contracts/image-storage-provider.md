# Contract: `IImageStorageProvider` Port

Internal application-layer contract (`src/application/features/images/common/ports.ts`) that `CloudinaryImageStorageProvider` (`src/infrastructure/images/cloudinaryImageStorageProvider.ts`) implements. Exists so the application layer — and the `StoredImage` shape it persists — never depends on the `cloudinary` package or its response shape directly (FR-004, FR-011).

```ts
interface ProviderUploadResult {
  externalId: string;
  url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
}

interface IImageStorageProvider {
  upload(buffer: Buffer, contentType: string): Promise<ProviderUploadResult>;
  delete(externalId: string): Promise<void>;
}
```

## `upload(buffer, contentType)`

- Sends the buffer to the provider with the upload-time optimization transformation applied (research.md §4 — `quality: 'auto', fetch_format: 'auto'` for the Cloudinary implementation); the returned `format`/`bytes`/`width`/`height` describe the stored, already-optimized asset.
- Throws on any provider-side failure (network, auth, quota, rejected upload) — no retry, no swallowed error; the caller (`storeImageCommandHandler`) decides what to do with the failure (research.md §5).
- Never receives or applies any transformation unrelated to storage/optimization (no crop, effects, tagging, or other on-demand Cloudinary feature) — FR-011.

## `delete(externalId)`

- Removes the asset at the provider by the `externalId` recorded on its `StoredImage`.
- Throws on provider failure; the caller decides whether to proceed with removing the database record (see `contracts/delete-image.md` — on a provider failure, the record is left in place rather than orphaning the deletion).
- Idempotent from the caller's perspective in practice (deleting an already-absent Cloudinary asset does not need special handling here, since `deleteImageCommandHandler` already checks the record's existence in MongoDB before calling this).

## Why a port at all

Mirrors this codebase's existing pattern for every other external integration (`IGoogleIdTokenValidator` → `GoogleIdTokenValidator`, `IInternalTokenIssuer` → `JwtInternalTokenIssuer`): the application layer's commands/queries and their unit tests depend only on this interface (satisfied in tests by `tests/fakes/fakeImageStorageProvider.ts`), never on the `cloudinary` SDK, so the provider could be swapped without touching `storeImageCommandHandler` or `deleteImageCommandHandler`.
