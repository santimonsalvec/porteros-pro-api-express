# Contract: Activate Portero Profile

## `POST /api/porteros/me/activate`

Activates the caller's portero profile once all four sections are complete. Requires a valid internal access token belonging to a client with a complete client profile (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`).

### Request

No body.

### Response — success

**Status**: `200 OK` — body: the full `PorteroRegistrationResponse` (see get-registration.md) with `status: "active"`.

```json
{
  "status": "active",
  "sections": {
    "identification": { "complete": true },
    "physicalData": { "complete": true },
    "location": { "complete": true },
    "availability": { "complete": true }
  },
  "documentType": "cedula_ciudadania",
  "...": "..."
}
```

### Response — one or more sections incomplete

**Status**: `409 Conflict`

```json
{
  "error": "portero_profile_incomplete",
  "message": "Complete all sections before activating your portero profile.",
  "missingSections": ["availability"]
}
```

`missingSections` lists every section (`identification`, `physicalData`, `location`, `availability`) whose `complete` is `false` — including all four, if no section was ever started (FR-016).

### Response — already active

**Status**: `409 Conflict`

```json
{ "error": "already_active", "message": "Your portero profile is already active." }
```

**Contract rules** (FR-016, FR-017, FR-018, FR-019, FR-025, FR-026):

- On success: a `PorteroProfile` is created from the registration's data (data-model.md), the source `PorteroRegistration` is flipped to `status: "active"` and permanently locked, and the client's existing client-facing profile/capabilities are entirely untouched.
- No token reissuance happens on activation (research.md §4) — portero status is never encoded in the access token; every route in this feature re-checks the database live.
- This endpoint does not itself expose the portero to any search/browse capability — it only guarantees a `PorteroProfile` record exists for a future search feature to query (spec Assumptions).
