# Contract: Save Goalkeeper Availability (City + Service Zones)

Replaces the prior `{ radiusKm }` contract entirely (research.md §7). Unlike the other three registration sections, both fields are **required together** in every request — there is no partial/independent save of just `cityId` or just `zoneIds`. Requires a valid internal access token belonging to a client with a complete client profile (`requireAuth`, `requireClientOnly`, `requireCompleteProfile`) — same gate as the other three `/me/*` section routes.

## `PATCH /api/goalkeepers/me/availability`

### Request

```json
{ "cityId": "city-envigado", "zoneIds": ["zone-medellin-bello", "zone-medellin-copacabana"] }
```

| Field | Required | Validation |
|---|---|---|
| `cityId` | Yes | Non-empty string; must reference an existing `City` |
| `zoneIds` | Yes | Non-empty array of strings; every id must reference a `Zone` that is `active` and belongs to `cityId`'s resolved anchor (research.md §2, §8) |

A request missing either field, or sending `zoneIds: []`, fails Zod-level validation before reaching the handler — `400 validation_failed` (the shared generic shape every route in this system already returns for malformed bodies).

### Response — success

**Status**: `200 OK` — body: the full `GoalkeeperRegistrationResponse` (see `get-registration.md` in `003`, extended per data-model.md with `cityId`/`serviceZoneIds`), reflecting the saved city and zones.

### Response — city does not exist

**Status**: `400 Bad Request`

```json
{ "error": "invalid_city", "message": "The provided city does not exist." }
```

### Response — one or more zones are invalid

**Status**: `400 Bad Request`

```json
{
  "error": "invalid_zones",
  "message": "One or more selected zones are invalid.",
  "invalidZoneIds": ["zone-bogota-chapinero"]
}
```

Triggered when any submitted zone id doesn't exist, isn't `active`, or doesn't belong to `cityId`'s resolved anchor. The entire save is rejected — nothing is partially persisted (research.md §8).

### Response — registration already active

**Status**: `409 Conflict`

```json
{ "error": "already_active", "message": "Your goalkeeper profile is already active; this data can no longer be changed here." }
```

Same as the other three section endpoints (FR-013) — changing service zones after activation is out of scope for this feature (spec Assumptions).

---

## `GET /api/goalkeepers/me` (modified)

No route or auth change — the existing `GoalkeeperRegistrationResponse` body now additionally includes:

```json
{
  "cityId": "city-envigado",
  "serviceZoneIds": ["zone-medellin-bello", "zone-medellin-copacabana"]
}
```

`cityId: null` and `serviceZoneIds: []` when the goalkeeper has never saved availability (including the synthesized `not_started` response when no registration document exists at all).
