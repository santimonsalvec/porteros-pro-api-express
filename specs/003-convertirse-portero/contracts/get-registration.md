# Contract: Get Portero Registration Status

## `GET /api/porteros/me`

Returns the caller's current portero registration state: every section's saved values (or `null`), each section's computed completeness, and the overall status. Requires a valid internal access token belonging to a client with a complete client profile (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`).

### Request

No body, no parameters.

### Response — success (always; there is no "not found" case)

**Status**: `200 OK`

```json
{
  "status": "in_progress",
  "sections": {
    "identification": { "complete": true },
    "physicalData": { "complete": true },
    "location": { "complete": true },
    "availability": { "complete": false }
  },
  "documentType": "cedula_ciudadania",
  "documentNumber": "1045678901",
  "issueDate": "2013-07-02",
  "birthDate": "1995-03-14",
  "documentPhotoASubmitted": true,
  "documentPhotoBSubmitted": true,
  "heightCm": 185,
  "weightKg": 78,
  "latitude": 6.244,
  "longitude": -75.581,
  "city": "Medellín",
  "state": "Antioquia",
  "country": "CO",
  "neighborhood": "Laureles",
  "radiusKm": null
}
```

If the client has never saved any section, the response is the same shape with `status: "not_started"`, every `sections.*.complete: false`, and every other field `null`/`false` — no database write happens to produce this (data-model.md, "Section-completeness view"; research.md §10).

### Response — caller is not signed in / not a client / client profile incomplete

**Status**: `401 Unauthorized` (no token) or `403 Forbidden` (admin account, or client profile not yet complete) — no custom body, matching `requireAuth`/`requireClientOnly`/`requireCompleteProfile`'s existing behavior on every other `/api/porteros` route.

**Contract rules** (FR-004, FR-005–FR-008):

- `formattedAddress` and the raw `StoredImage` ids for the document photos are never included in this response — only the derived `documentPhotoASubmitted`/`documentPhotoBSubmitted` booleans (data-model.md's Response DTO).
- Once `status` is `"active"`, this endpoint keeps returning the same shape (read from the now-locked `PorteroRegistration`, which holds identical values to the `PorteroProfile` created at activation) — it does not switch to a different response shape.
