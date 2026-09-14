# Phase 1 Data Model: Align Code with Renamed Location Collections

## Entities

### Country

Unchanged in shape and meaning — only its underlying MongoDB collection name changes.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Derived from Mongo `_id`, tolerating either an `ObjectId` or a raw `string` (pre-existing, externally-owned data) |
| `name` | string | Country display name |
| `dialCode` | string | International dialing code |
| `countryCode` | string | ISO-style country code, used for lookups |

- **Source collection**: `countries` (was `Countries`).
- **Ownership**: Externally owned reference data — this system only reads it (`getAll`, `getById`, `findByCountryCode`); writes are rejected.
- **Relationships**: None changed by this feature.
- **Validation rules**: None changed — the repository continues to tolerate either `ObjectId` or `string` for `_id`.

## Out of scope for this change (deferred)

The following are recorded for awareness only, per spec Assumptions and FR-005. No entity, field, or repository exists for them yet in this codebase, so there is nothing to model or migrate today:

- `City` (future collection: `cities`, was `Cities`)
- `Region` (future collection: `regions`, was `States`)
- The `City.regionId` field (was `stateId`) linking a city to its region

Whenever city/region support is built, it MUST use these new names from the start.
