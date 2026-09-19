# Phase 1 Data Model: Goalkeeper Service Zones (Zone-Based Availability)

## `City` (`src/domain/locations/city.ts`, MongoDB collection `cities` — pre-existing, externally owned, read-only from this system, mirrors `Country`/`CountryRepository`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (GUID) | `_id` in Mongo |
| `name` | `string` | Display name, e.g. `"Envigado"` |
| `regionId` | `string` | References a `regions` document (`004`'s renamed `States`/`stateId`) |
| `zoneCityId` | `string \| null` | Self-reference to this city's "anchor" — the city that actually owns `Zone` documents. `null`/absent when the city is itself an anchor (e.g. Medellín) |

**Domain behavior**: None beyond the plain data — read-only reference data, same contract as `Country` (`add`/`update`/`delete` throw from `CityRepository`).

## `Region` (`src/domain/locations/region.ts`, MongoDB collection `regions` — pre-existing, externally owned, read-only, `004`'s renamed `States`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `_id` in Mongo |
| `name` | `string` | Display name, e.g. `"Antioquia"` |

## `Zone` (`src/domain/zones/zone.ts`, MongoDB collection `zones` — pre-existing, externally owned, read-only from this system)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (GUID) | `_id` in Mongo |
| `cityId` | `string` | Always an **anchor** city's id — never a satellite city's id |
| `name` | `string` | e.g. `"Bello"` |
| `slug` | `string` | e.g. `"medellin-co-bello"` — used only for display/debugging by this system; never used to join `neighborZoneIds` (research.md §12 — that field isn't read by this system at all) |
| `geometry` | `{ type: 'Polygon' \| 'MultiPolygon'; coordinates: unknown[] }` | Raw GeoJSON, passed through opaquely — this system never inspects or validates its contents, only stores/returns it |
| `active` | `boolean` | Only `true` zones are ever listed or accepted on save |
| `displayOrder` | `number` | Stable sort key within one anchor city's zone list |

Fields present on the pre-existing document but not read by this system: `centroid`, `bbox`, `neighborZoneIds` (research.md §12).

**Domain behavior**: None — read-only reference data.

## `GoalkeeperRegistration.availability` (modified — `src/domain/goalkeepers/goalkeeperRegistration.ts`, MongoDB collection `goalkeeperRegistrations`)

Replaces the prior KM-radius shape entirely (this feature supersedes it; no dual-write, no migration of old `radiusKm` values — out of scope per the source prompt, which describes this as a replacement, not an addition):

| Field | Type | Notes |
|---|---|---|
| `availability.cityId` | `string \| null` | The goalkeeper's **own chosen** city — may be a satellite city, not necessarily an anchor. `null` until saved |
| `availability.zoneIds` | `string[]` | The exact set of selected `Zone.id`s, deduplicated (research.md §8). Empty (`[]`) until saved |

`saveAvailability(fields: Partial<{cityId, zoneIds}>): void` keeps the entity's existing merge-setter shape, but — unlike the other three sections — the *handler* always calls it with both keys present together (research.md §7); the entity method itself doesn't enforce that, consistent with this codebase's convention that handlers, not entities, own preconditions.

**Section completeness** (`computeGoalkeeperSections`, `src/application/features/goalkeepers/common/goalkeeperSections.ts`): `availability.complete` is now `true` iff `cityId !== null && zoneIds.length > 0` (previously `radiusKm !== null`).

## `GoalkeeperProfile` (modified — `src/domain/goalkeepers/goalkeeperProfile.ts`, MongoDB collection `goalkeeperProfiles`)

`radiusKm: number` is replaced 1:1 (research.md §10):

| Field | Type | Notes |
|---|---|---|
| `cityId` | `string` | Copied from the activated registration's `availability.cityId` |
| `zoneIds` | `string[]` | Copied from the activated registration's `availability.zoneIds` (guaranteed non-empty — activation requires `availability.complete`) |

No other field changes. `createFromRegistration` reads `availability.cityId!`/`availability.zoneIds` instead of `availability.radiusKm!`.

## Response DTO (modified — `src/application/features/goalkeepers/common/goalkeeperRegistrationResponse.ts`)

`radiusKm: number | null` is replaced with (research.md §11 — deliberately different field name than the request):

```ts
interface GoalkeeperRegistrationResponse {
  // ...unchanged fields...
  cityId: string | null;
  serviceZoneIds: string[]; // [] when none saved yet
}
```

## New read-only query results (not persisted)

```ts
// GET /api/locations/cities?q=
interface CityOption {
  id: string;
  name: string;
  region: string;   // resolved Region.name
  hasZones: boolean; // true iff resolveAnchorCityId(city) has ≥1 active Zone
}

// GET /api/zones?cityId=
interface ZoneOption {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };
}
```

## Repository ports

```ts
// application/features/locations/common/ports.ts
interface ICityRepository {
  getById(id: string): Promise<City | null>;
  searchByName(query: string, limit: number): Promise<City[]>;
}
interface IRegionRepository {
  getByIds(ids: string[]): Promise<Region[]>;
}

// application/features/zones/common/ports.ts
interface IZoneRepository {
  getActiveByCityId(anchorCityId: string): Promise<Zone[]>; // sorted by displayOrder asc
  getManyByIds(ids: string[]): Promise<Zone[]>;
  hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>>; // anchor ids with ≥1 active zone
}
```

All three are read-only reference-data repositories — no `add`/`update`/`delete` capability is defined at all (unlike `ICountryRepository`, which extends the full `IRepository` and throws on writes; these follow `IDocumentTypeRepository`'s narrower, more recent precedent — research.md §1).

## Suggested indexes (data-owner's collections, not created by this system's migrations — matches `CountryRepository`'s stance that `countries`/`cities`/`zones`/`regions` are externally owned; `ensureIndexes()` on each new repository is still provided, mirroring `GoalkeeperRegistrationRepository`, so they self-heal in any environment this app connects to)

- `zones`: `{ cityId: 1, active: 1, displayOrder: 1 }`
- `cities`: prefix/text index on `name`; `{ zoneCityId: 1 }`
