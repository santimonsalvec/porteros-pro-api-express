# Contract: Retrieve Image Endpoint

## `GET /api/images/:id`

Resolves a previously stored image's identifier to its current accessible location. Requires a valid internal access token (`requireAuth`); the resolved `StoredImage.uploadedBy` must equal the caller's own subject (research.md §6 — the narrowest default until a future feature layers its own resource-level authorization on top, per spec Assumptions and Clarifications session 2026-08-30).

### Response — success

**Status**: `200 OK`

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

### Response — caller is not signed in

**Status**: `401 Unauthorized` — no custom body.

### Response — image does not exist

**Status**: `404 Not Found`

```json
{ "error": "image_not_found", "message": "This image no longer exists." }
```

### Response — caller is not authorized for this image

**Status**: `403 Forbidden`

```json
{ "error": "forbidden", "message": "You do not have access to this image." }
```

Returned when the id exists but `uploadedBy` doesn't match the caller — deliberately distinct from `404` so the two acceptance scenarios (User Story 2, scenarios 2 and 3) stay independently observable in tests, even though both ultimately deny the location to the caller.

**Contract rules** (FR-005, FR-006):

- This resolution is never reachable without `requireAuth` — there is no public/anonymous variant of this endpoint.
- The returned `url` is the same stable link recorded at upload time (research.md §7) — it is not re-signed, re-generated, or time-limited on each call.
