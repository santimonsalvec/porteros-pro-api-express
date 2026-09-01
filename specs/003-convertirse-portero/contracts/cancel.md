# Contract: Cancel Portero Registration

## `POST /api/porteros/me/cancel`

Permanently discards the caller's in-progress registration — all saved section data and any uploaded document photos. Requires a valid internal access token belonging to a client with a complete client profile (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`).

### Request

No body.

### Response — success

**Status**: `200 OK` — body: the full `PorteroRegistrationResponse` (see get-registration.md), reset to the `not_started` shape.

```json
{
  "status": "not_started",
  "sections": {
    "identification": { "complete": false },
    "physicalData": { "complete": false },
    "location": { "complete": false },
    "availability": { "complete": false }
  },
  "documentType": null,
  "documentNumber": null,
  "issueDate": null,
  "birthDate": null,
  "documentPhotoASubmitted": false,
  "documentPhotoBSubmitted": false,
  "heightCm": null,
  "weightKg": null,
  "latitude": null,
  "longitude": null,
  "city": null,
  "state": null,
  "country": null,
  "neighborhood": null,
  "radiusKm": null
}
```

This exact response is also returned when the caller had never started any section — cancellation is a graceful no-op in that case, not an error (spec Edge Cases).

### Response — registration already active

**Status**: `409 Conflict`

```json
{ "error": "already_active", "message": "Your portero profile is already active; it cannot be cancelled here." }
```

Deactivating or removing an active portero profile is a separate, out-of-scope capability (FR-021).

**Contract rules** (FR-020, FR-021):

- Any `StoredImage`s referenced by `documentPhotoAId`/`documentPhotoBId` are deleted via `DeleteImageCommand` (mediator) before the `PorteroRegistration` document itself is deleted — no orphaned images remain.
- The `PorteroRegistration` document is deleted entirely, not soft-deleted or flagged — a client who registers again afterward starts from a completely fresh document (spec Edge Cases), and the document type + number they used before becomes free for a new registration to reuse (since only *current* — in-progress or active — registrations are checked for the duplicate-document rule, FR-023).
