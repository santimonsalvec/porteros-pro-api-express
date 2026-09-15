# Contract: Preview a City's Service Zones

## `GET /api/zones?cityId=<id>`

Lets a client preview the active service zones for a city it is *considering* — before that city has been saved as the goalkeeper's own. Requires a valid internal access token (`requireAuth`) — no client-role or complete-profile requirement (research.md §6). The `cityId` is caller-supplied and trusted as-is (public, non-sensitive geographic reference data — the source prompt is explicit there's nothing here to protect beyond authentication).

### Request

Query parameter `cityId` (string, required).

### Response — success

**Status**: `200 OK`

```json
{
  "zones": [
    {
      "id": "zone-medellin-bello",
      "name": "Bello",
      "slug": "medellin-co-bello",
      "displayOrder": 3,
      "geometry": { "type": "Polygon", "coordinates": [[[-75.552, 6.352], "..."]] }
    }
  ]
}
```

`cityId` is resolved to its anchor (research.md §2) before looking up zones — a satellite city (e.g. Envigado) returns its metro anchor's (Medellín's) zones. `zones` is sorted by `displayOrder` ascending and contains only `active` zones.

### Response — city does not exist

**Status**: `404 Not Found`

```json
{ "error": "city_not_found", "message": "The requested city does not exist." }
```

### Response — city (or its anchor) has no configured zones

**Status**: `404 Not Found`

```json
{ "error": "no_zones_configured", "message": "No service zones are configured for this city yet." }
```

Distinct `error` code from `city_not_found` so a client can tell "this city doesn't exist" apart from "this is a real, valid city we just haven't configured zones for yet" (research.md §9) — the reference mockup shows a different message for each case.
