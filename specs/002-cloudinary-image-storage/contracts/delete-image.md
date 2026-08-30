# Contract: Delete Image Endpoint

## `DELETE /api/images/:id`

Permanently deletes a previously stored image from both the storage provider and the management record store, as a single consistent outcome (FR-007). Requires a valid internal access token (`requireAuth`); only the uploader may delete their own image (FR-008).

### Response — success

**Status**: `204 No Content`

### Response — caller is not signed in

**Status**: `401 Unauthorized` — no custom body.

### Response — image does not exist (already deleted, or never existed)

**Status**: `404 Not Found`

```json
{ "error": "image_not_found", "message": "This image no longer exists." }
```

Returned the same way whether the id never existed or was already deleted — a second delete of the same id is not an error condition (User Story 3, acceptance scenario 2; edge case: concurrent deletes converge on this same response for the loser).

### Response — caller did not upload this image

**Status**: `403 Forbidden`

```json
{ "error": "forbidden", "message": "You do not have access to this image." }
```

**Contract rules** (FR-006, FR-007, FR-008):

- Deletes the provider asset (by its `externalId`) and the `images` record together; if the provider delete fails, the record is **not** removed and the request fails rather than leaving an orphaned record with no backing file (mirrors the compensation principle in research.md §5, applied to the opposite direction).
- After a successful delete, the same id immediately returns `404` from `GET /api/images/:id` (FR-006).
