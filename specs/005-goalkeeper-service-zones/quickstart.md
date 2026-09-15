# Quickstart: Goalkeeper Service Zones (Zone-Based Availability)

## Prerequisites

- Everything in `specs/003-convertirse-goalkeeper/quickstart.md` — a valid access token for a client whose profile is complete, and (for the availability step) a goalkeeper registration that isn't active yet.
- No new environment variables are introduced by this feature.
- The `cities`, `regions`, and `zones` collections must already be populated (pre-existing, externally owned — see the source prompt's example `Zone` document and `cities.zoneCityId` note). This feature only reads them; it seeds nothing.

## Try it (with a valid access token from an existing, complete client profile)

```bash
TOKEN="<paste-a-valid-access-token-here>"

# Search for a city
curl -s "http://localhost:3000/api/locations/cities?q=envigado" -H "Authorization: Bearer $TOKEN" | jq
# → 200, [{ "id": "...", "name": "Envigado", "region": "Antioquia", "hasZones": true }]

# Preview that city's zones (before saving anything)
curl -s "http://localhost:3000/api/zones?cityId=<envigado-id>" -H "Authorization: Bearer $TOKEN" | jq
# → 200, { "zones": [ ... Medellín's zones, since Envigado is a satellite ... ] }

# A city with no configured zones yet
curl -s "http://localhost:3000/api/zones?cityId=<bogota-id>" -H "Authorization: Bearer $TOKEN" | jq
# → 404, { "error": "no_zones_configured", ... }

# Save availability: chosen city + selected zones together
curl -s -X PATCH http://localhost:3000/api/goalkeepers/me/availability \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cityId": "<envigado-id>", "zoneIds": ["<bello-zone-id>", "<copacabana-zone-id>"]}' | jq
# → 200, { "cityId": "<envigado-id>", "serviceZoneIds": ["<bello-zone-id>", "<copacabana-zone-id>"], "sections": { "availability": { "complete": true }, ... } }

# Confirm it round-trips
curl -s http://localhost:3000/api/goalkeepers/me -H "Authorization: Bearer $TOKEN" | jq
# → same cityId/serviceZoneIds as above

# Reject: zone from a different city's zone set
curl -s -X PATCH http://localhost:3000/api/goalkeepers/me/availability \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cityId": "<envigado-id>", "zoneIds": ["<some-cali-zone-id>"]}' | jq
# → 400, { "error": "invalid_zones", "invalidZoneIds": ["<some-cali-zone-id>"] }

# Reject: zero zones (fails before reaching the handler)
curl -s -X PATCH http://localhost:3000/api/goalkeepers/me/availability \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"cityId": "<envigado-id>", "zoneIds": []}' | jq
# → 400, { "error": "validation_failed", ... }
```

## Automated tests

```bash
npm test              # unit: handlers (fakes/mocked repositories) + new query handlers
npm run test:http     # supertest against /api/locations/cities, /api/zones, /api/goalkeepers/me/availability
```
