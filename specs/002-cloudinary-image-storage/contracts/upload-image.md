# Contract: Upload Image Endpoint

## `POST /api/images`

Uploads a single image, optimized and stored at the configured storage provider, and creates its management record. Requires a valid internal access token (`requireAuth`) — the record's `uploadedBy` is always the token's own subject.

### Request

`multipart/form-data` with a single file field named `image`.

| Field | Required | Notes |
|---|---|---|
| `image` | Yes | The image file. Content is sniffed from its actual bytes, not trusted from its `Content-Type` header or filename. Accepted: JPEG, PNG, WEBP, HEIC, HEIF. Max size: `IMAGE_MAX_UPLOAD_SIZE_BYTES` (default 10 MB). |

### Response — success

**Status**: `201 Created`

```json
{
  "id": "0192f1b2-2f3a-7c31-9a3e-1234567890ab",
  "url": "https://res.cloudinary.com/.../image/upload/v1234567890/abcxyz.jpg",
  "format": "jpg",
  "bytes": 184320,
  "width": 3024,
  "height": 4032,
  "createdAt": "2026-08-30T15:04:05.000Z"
}
```

### Response — validation failed (not a valid/supported image, or no file provided)

**Status**: `400 Bad Request`

```json
{ "error": "invalid_image", "message": "The uploaded file is not a supported image." }
```

Covers: missing `image` field; content sniffing finds no image signature, or a signature outside the accepted list (JPEG/PNG/WEBP/HEIC/HEIF) — regardless of the claimed `Content-Type` or filename extension.

### Response — file too large

**Status**: `413 Payload Too Large`

```json
{ "error": "file_too_large", "message": "The uploaded file exceeds the maximum allowed size." }
```

Rejected by the `multer` size limit before the file reaches the storage provider (FR-010) — no record is created.

### Response — storage provider failure

**Status**: `502 Bad Gateway`

```json
{ "error": "storage_unavailable", "message": "The image could not be stored. Please try again." }
```

No record is created for a failed upload (FR-003, User Story 1 acceptance scenario 4).

### Response — caller is not signed in

**Status**: `401 Unauthorized` — no custom body.

**Contract rules** (FR-001, FR-002, FR-003, FR-004, FR-009, FR-010, FR-012):

- Exactly one image per request; no batch upload.
- The stored asset is the provider-optimized version (research.md §4) — `bytes`/`format`/`width`/`height` in the response describe that stored asset, not the originally uploaded file.
- If the provider upload succeeds but persisting the record fails, the handler compensates by deleting the just-created provider asset before surfacing an error (research.md §5) — the caller never sees a `201` for something that didn't actually get recorded.
