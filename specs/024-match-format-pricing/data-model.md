# Data Model: 024-match-format-pricing

## New collection `matchSurfaces` (seeded, read-only here)

```json
{ "_id": "synthetic_grass", "name": "Grama sintética", "active": true, "order": 1 }
```

| Field | Rule |
|---|---|
| `_id` | string, stable, used as `surfaceId` |
| `name` | non-empty string, shown to users |
| `active` | boolean; `false` hides it from `/config` and rejects it in quotes |
| `order` | integer, ascending in `/config` |

Domain: `src/domain/pricing/matchSurface.ts` (`MatchSurface`, validates like
`RentalRate`). Seed: `scripts/seed-match-surfaces.ts` (5 defaults, upsert).

## `rentalRates` — two optional fields

| Field | Values | Absent means |
|---|---|---|
| `modality` | `micro_futsal`, `futbol_medio`, `futbol_11` | applies to every modality (general) |
| `level` | `recreational`, `competitive` | applies to every level of that modality |

`level` without `modality` → `InvalidConfigurationError`. `any` is never
stored (it is the absence of `modality`).

Index: drop `scope_refId_durationMinutes`; create unique
`scope_refId_duration_modality_level` on
`{ scope, refId, durationMinutes, modality, level }` (missing fields index as
`null`, so one general row per scope/ref/duration stays unique).

## `commissionSettings` — same two optional fields

Index: drop `scope_refId`; create unique `scope_refId_modality_level`.

## `MatchFormat` value (domain, `src/domain/bookings/matchFormat.ts`)

```ts
type Modality = 'micro_futsal' | 'futbol_medio' | 'futbol_11' | 'any';
type MatchLevel = 'recreational' | 'competitive';
class MatchFormat { modality; level; surfaceId; surfaceName }
```

Stored inside `MatchDetails` as `format: MatchFormat | null` →
persisted as `match.format` in `quotes` and `goalkeeperRequests`:

```json
"format": { "modality": "futbol_11", "level": "competitive", "surfaceId": "synthetic_grass", "surfaceName": "Grama sintética" }
```

Old documents have no `format` → `null`.

## `bookings.dismissedGoalkeeperIds: string[]` (new, default `[]`)

`$addToSet` on every booking of the request on dismissal; copied onto
replacement bookings (feature 018) together with `excludedGoalkeeperIds`.
`isEligible` returns `false` when it contains the goalkeeper. No new index
(the list query already filters by zone/status).
