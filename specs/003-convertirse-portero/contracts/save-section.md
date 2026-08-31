# Contract: Save a Registration Section

Four endpoints share this same request/response pattern — one per section (research.md §3). Each accepts a JSON body where **every field is optional**; only fields actually present are validated and merged into the client's stored section, leaving previously saved fields in that same section untouched. All four require a valid internal access token belonging to a client with a complete client profile (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`).

## `PATCH /api/porteros/me/identification`

### Request

```json
{
  "documentType": "cedula_ciudadania",
  "documentNumber": "1045678901",
  "issueDate": "2013-07-02",
  "birthDate": "1995-03-14"
}
```

| Field | Required in payload | Validation |
|---|---|---|
| `documentType` | No | Must match a `DocumentType.code` in the reference collection |
| `documentNumber` | No | Non-empty after trim |
| `issueDate` | No | Valid ISO date; not in the future; not before `birthDate` (using whichever `birthDate` value — this request's or a previously saved one — ends up in effect) |
| `birthDate` | No | Valid ISO date; not in the future; indicates an age ≥ 18 |

Any two or more fields may arrive together or separately, in any order, across any number of requests.

### Response — success

**Status**: `200 OK` — body: the full `PorteroRegistrationResponse` (see get-registration.md), reflecting the merge.

### Response — validation failed

**Status**: `400 Bad Request`

```json
{
  "error": "validation_failed",
  "message": "One or more fields are invalid.",
  "fieldErrors": { "birthDate": "You must be at least 18 years old to register as a portero." }
}
```

### Response — unrecognized document type

**Status**: `400 Bad Request`

```json
{ "error": "invalid_document_type", "message": "The provided document type is not recognized." }
```

### Response — document already registered

**Status**: `409 Conflict`

```json
{ "error": "duplicate_document", "message": "This identification document is already registered to a portero account." }
```

Triggered only when, after merging, both `documentType` and `documentNumber` are present and match an existing registration or active profile other than the caller's own (FR-023, research.md §8).

### Response — registration already active

**Status**: `409 Conflict`

```json
{ "error": "already_active", "message": "Your portero profile is already active; this data can no longer be changed here." }
```

FR-024 — applies identically to the other three section endpoints below.

---

## `PATCH /api/porteros/me/physical-data`

```json
{ "heightCm": 185, "weightKg": 78 }
```

| Field | Validation |
|---|---|
| `heightCm` | Number, 120–230 |
| `weightKg` | Number, 40–150 |

Same success/validation-failed/already-active response shapes as above (no document-type or duplicate-document case here).

---

## `PATCH /api/porteros/me/location`

```json
{
  "latitude": 6.244,
  "longitude": -75.581,
  "city": "Medellín",
  "state": "Antioquia",
  "country": "CO",
  "neighborhood": "Laureles",
  "formattedAddress": "Cra. 70 # 44-12, Laureles, Medellín, Colombia"
}
```

| Field | Validation |
|---|---|
| `latitude` | -90 to 90 |
| `longitude` | -180 to 180 |
| `city` | Non-empty after trim |
| `state` | Non-empty after trim |
| `country` | Non-empty after trim (ISO country code) |
| `neighborhood` | Optional, no completeness effect |
| `formattedAddress` | Optional, internal-only — accepted and stored but never returned in any response (FR-018, FR-021) |

Same success/validation-failed/already-active response shapes.

---

## `PATCH /api/porteros/me/availability`

```json
{ "radiusKm": 25 }
```

| Field | Validation |
|---|---|
| `radiusKm` | Integer, 10–50 |

Same success/validation-failed/already-active response shapes.
