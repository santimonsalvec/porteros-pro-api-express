# Phase 0 Research: Goalkeeper Service Zones (Zone-Based Availability)

No `NEEDS CLARIFICATION` markers remain in the Technical Context — this feature reuses the existing stack unchanged (no new dependency, per `CLAUDE.md`). The decisions below resolve design questions the source prompt left to implementation judgment, each cross-checked against this repository's existing conventions (features `001`–`004`).

## §1. Where do `City`, `Region`, and `Zone` live in the architecture?

**Decision**: New `domain/locations/city.ts` and `domain/locations/region.ts`; new `domain/zones/zone.ts` (separate top-level domain folder, since `/api/zones` is its own controller/feature, not folded into `locations`). Ports: `ICityRepository`/`IRegionRepository` in a new `application/features/locations/common/ports.ts`; `IZoneRepository` in a new `application/features/zones/common/ports.ts`. The `goalkeepers` feature's `SaveAvailabilitySectionCommandHandler` imports both cross-feature, exactly as `GetCountriesQueryHandler` already imports `ICountryRepository` from the `profile` feature's `common/ports.ts` today — this repo already treats reference-data ports as shared, not feature-private.

**Rationale**: Mirrors two things already established here: (a) `documentTypes` in `003` used a *minimal*, non-`IRepository`-extending port (`IDocumentTypeRepository { getAll(); findByCode(); }`) for read-only reference data instead of forcing the full `add`/`update`/`delete`-throws shape `CountryRepository` uses — the more recent, closer precedent wins; (b) cross-feature port reuse for reference data is already normal in this codebase.

**Alternatives considered**: Putting `City`/`Zone` under `goalkeepers/` since that's the only current consumer — rejected, since `locationsController` and the new `zonesController` are the actual owners of this data per the source prompt, and a future goalkeeper-search feature will need the same repositories without importing through `goalkeepers`.

## §2. Resolving a city's "anchor" (the city that actually owns `Zone` documents)

**Decision**: A pure helper, `resolveAnchorCityId(city: City): string`, returning `city.zoneCityId ?? city.id`. Lives in `application/features/locations/common/resolveAnchorCityId.ts`, imported by `zones` (to resolve the preview endpoint) and by `goalkeepers` (to validate a save).

**Rationale**: The source prompt states `cities.zoneCityId` is a self-reference GUID present only on satellite municipalities; an anchor city (e.g., Medellín) has no `zoneCityId` and owns its own `Zone.cityId`. A single shared function keeps this one-line rule from being reimplemented three times and drifting.

## §3. Resolving a city's displayed region name

**Decision**: `cities.regionId` (per `004`'s rename) is resolved against the `regions` collection via `IRegionRepository.getByIds(ids)`, batched once per search response (not one query per city).

**Rationale**: `004`'s spec explicitly records `Cities.stateId` → `cities.regionId`, `States` → `regions` as already-renamed-but-unused-by-code names, reserved for "whenever city/region functionality is implemented" — this is that feature. No denormalized region-name field is assumed on `cities` itself, since none was documented.

## §4. City search implementation

**Decision**: Case-insensitive substring/prefix match on `cities.name` (Mongo regex against a prefix/text index, per the source prompt's own indexing note), capped at 15 results, no pagination. An empty or missing `q` returns an empty list rather than the full catalog (mirrors the reference mockup, which renders nothing until the user types).

**Rationale**: Matches the source prompt's explicit "~10-15 resultados" cap and its own suggested index (`{ name: 1 }` text/prefix). Small reference dataset — no need for a dedicated search engine.

## §5. Computing `hasZones` for many search results at once

**Decision**: `IZoneRepository.hasActiveZonesForCityIds(anchorCityIds: string[]): Promise<Set<string>>` — one aggregation (`distinct` on `cityId` with `active: true`, filtered to the requested anchor ids) per search call, not one query per result row.

**Rationale**: `GET /api/locations/cities` returns up to 15 rows; doing 15 sequential zone-existence checks would be wasteful and is easy to avoid with one query.

## §6. Authentication requirements for the two new read endpoints

**Decision**: Both `GET /api/locations/cities` and `GET /api/zones` require `requireAuth` only — no `requireClientOnly`, no `requireCompleteProfile`.

**Rationale**: The source prompt is explicit for city search ("Autenticado, sin requisito de tener perfil de portero"). For zone listing it says the data has "nada que proteger" (implying it could even be public); applying the same minimal `requireAuth`-only gate as city search keeps both endpoints consistent with each other and errs toward *not* introducing a new no-auth precedent beyond what `/api/locations/countries` already established for genuinely public reference data.

## §7. `PATCH /me/availability`'s contract shape — diverges from the other three sections

**Decision**: Unlike `identification`/`physicalData`/`location` (every field optional, merged independently across any number of requests), `cityId` and `zoneIds` are **both required together** in a single request; there is no "merge just `cityId` now, add `zoneIds` later" partial mode.

**Rationale**: The source prompt is explicit — "al guardar se persisten ciudad + zonas juntas" — and the reference mockup's UI only ever enables a single "Guardar" action once both a city and at least one zone are chosen; there is no independent save for one without the other. Saving a `cityId` with zero zones (or zones without a city) would produce a nonsensical, inherently incomplete availability record with no valid intermediate meaning — unlike, say, saving `heightCm` before `weightKg`.

## §8. Validating `zoneIds` against the resolved anchor

**Decision**: The handler deduplicates the incoming `zoneIds` (`Array.from(new Set(...))`) before validation and storage, then fetches all of them in one `IZoneRepository.getManyByIds(ids)` call and checks each is present, `active`, and has `cityId === resolvedAnchorId`. Any failure rejects the *entire* save (`400 invalid_zones`, with the specific offending ids returned as `invalidZoneIds` in the error's `extra` payload, following the `ApiError` `extra` mechanism `activateGoalkeeperCommandHandler` already uses for `missingSections`) — nothing is partially persisted.

**Rationale**: Directly implements the source prompt's validation rule and its "400 con detalle" requirement. Deduplication is a minor, inconsequential input-hygiene choice (the source prompt is silent on repeated ids) — a "set of selected zones" has no meaningful concept of a duplicate.

## §9. `GET /api/zones?cityId=` 404 semantics

**Decision**: Two distinct `404` outcomes, same status code, different `error` codes: `city_not_found` (the `cityId` doesn't resolve to any city at all) vs. `no_zones_configured` (the city — or its resolved anchor — exists but has zero active zones). Both are `404`, per the source prompt, but the distinct `error` code lets a client tell "you searched for something that doesn't exist" apart from "this is a real city we just haven't configured yet" (the reference mockup's own empty-state message depends on this distinction).

**Rationale**: The source prompt only specifies the status code (404 for both), not the body; keeping the codes distinct is a low-cost way to preserve the UX difference the mockup already relies on without inventing a new status code.

## §10. Reusing `GoalkeeperProfile.radiusKm`

**Decision**: `GoalkeeperProfile.radiusKm: number` is replaced 1:1 with `cityId: string` and `zoneIds: string[]`, copied from the registration's `availability` section at activation — exactly as every other `GoalkeeperProfile` field is already copied there today. No new capability is added to `GoalkeeperProfile` (still no mutating methods, still not exposed by any route beyond what already reads `GoalkeeperRegistration`).

**Rationale**: `GoalkeeperProfile.createFromRegistration` already reads the entire `availability` section unconditionally; swapping its shape is required just to keep the type checking, and is a pure carry-over of the existing "permanent record retains the activated data" behavior — not a new feature.

## §11. Field naming: request `zoneIds` vs. response `serviceZoneIds`

**Decision**: The `PATCH /me/availability` request body uses `zoneIds` (write side); `GET /me`'s response uses `serviceZoneIds` (read side). The domain entity's internal field stays `zoneIds` (matches the command and the Mongo document); only `toGoalkeeperRegistrationResponse`'s projection renames it to `serviceZoneIds`.

**Rationale**: The source prompt is explicit and consistent about both names in their respective contracts — not a naming slip to "fix," just two different DTOs.

## §12. What a returned `Zone` includes

**Decision**: `GET /api/zones` returns, per zone: `id`, `name`, `slug`, `displayOrder`, and `geometry` (the raw GeoJSON `Polygon`/`MultiPolygon`) — enough for a client to render each zone as a distinct, labeled, tappable map shape (`L.geoJSON(...).getBounds()` in the reference mockup needs only `geometry`) and enough to be selected by `id` in the save contract. `centroid`, `bbox`, and `neighborZoneIds` are **not** returned — nothing in the reference mockup's actual rendering logic reads them (`centroid` sits unused in its mock `properties`; `bbox`/`neighborZoneIds` aren't read at all), and the source prompt explicitly warns `neighborZoneIds` holds slugs, not ids, so exposing it without a clear consumer risks inviting incorrect `$lookup`-by-id usage downstream.

**Rationale**: YAGNI — ship what the one known consumer (the availability screen) actually uses; extending the response later is a compatible, additive change if a future map feature needs bounding boxes or neighbor suggestions.
