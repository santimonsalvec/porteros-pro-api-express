# Contract: Save Identification Document Photos

## `POST /api/porteros/me/document-photo`

Uploads a photo for either or both sides of the identification document. Requires a valid internal access token belonging to a client with a complete client profile (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`).

### Request

`multipart/form-data` with up to two file fields, each independently optional:

| Field | Required | Notes |
|---|---|---|
| `sideA` | No | Photo for document side A. Same validation as `/api/images` (research.md §11): content-sniffed, JPEG/PNG/WEBP/HEIC/HEIF, max `IMAGE_MAX_UPLOAD_SIZE_BYTES` |
| `sideB` | No | Photo for document side B. Same validation |

At least one of `sideA`/`sideB` must be present.

### Response — success

**Status**: `200 OK` — body: the full `PorteroRegistrationResponse` (see get-registration.md), with `documentPhotoASubmitted`/`documentPhotoBSubmitted` reflecting whichever side(s) were just uploaded.

### Response — no file provided

**Status**: `400 Bad Request`

```json
{ "error": "invalid_image", "message": "At least one of sideA or sideB must be provided." }
```

### Response — a provided file is not a supported image

**Status**: `400 Bad Request`

```json
{ "error": "invalid_image", "message": "The uploaded file is not a supported image." }
```

Same content-sniffing rule as `/api/images` — a file is judged by its actual bytes, not its claimed `Content-Type` or filename.

### Response — file too large

**Status**: `413 Payload Too Large`

```json
{ "error": "file_too_large", "message": "The uploaded file exceeds the maximum allowed size." }
```

### Response — storage provider failure

**Status**: `502 Bad Gateway`

```json
{ "error": "storage_unavailable", "message": "The image could not be stored. Please try again." }
```

### Response — registration already active

**Status**: `409 Conflict`

```json
{ "error": "already_active", "message": "Your portero profile is already active; document photos can no longer be changed here." }
```

**Contract rules** (FR-013, FR-014, FR-015):

- `sideA` and `sideB` are processed independently — if one succeeds and the other fails validation, the successful one is still saved and its old photo (if any) is still replaced; the response reflects the mixed outcome via a `fieldErrors`-style body when relevant (`{ "sideB": "The uploaded file is not a supported image." }`) alongside the updated state for the side that did succeed.
- When a side already has a photo, the **new** upload succeeds at the storage provider *before* the old one is deleted (research.md §5) — a failed re-upload never leaves that side with zero photos.
- The stored `StoredImage` for each side is only ever resolvable through this system's own authenticated/authorized channels (`002`'s FR-005) — never a public URL.
