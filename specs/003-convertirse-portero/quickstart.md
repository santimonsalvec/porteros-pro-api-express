# Quickstart: Become a Portero — Progressive Registration & Activation

## Prerequisites

- Everything in `specs/001-porteros-api-migration/quickstart.md` and `specs/002-cloudinary-image-storage/quickstart.md` (Node.js 24, a reachable MongoDB instance, a working `/api/auth/sso/exchange` flow, `CLOUDINARY_URL` set) — a valid access token for a client whose profile is already complete (`profileComplete: "true"` in the token).
- No new environment variables are introduced by this feature.

## Seed the document types reference collection

Same manual-seeding pattern already used for `Countries` — insert into the new `documentTypes` collection:

```json
[
  { "code": "cedula_ciudadania", "name": "Cédula de ciudadanía" },
  { "code": "cedula_extranjeria", "name": "Cédula de extranjería" },
  { "code": "pasaporte", "name": "Pasaporte" }
]
```

## Try it (with a valid access token from an existing, complete client profile)

```bash
TOKEN="<paste-a-valid-access-token-here>"

# See the fixed set of document types
curl -s http://localhost:3000/api/porteros/document-types | jq

# Check registration status (nothing started yet)
curl -s http://localhost:3000/api/porteros/me -H "Authorization: Bearer $TOKEN" | jq
# → 200, { "status": "not_started", "sections": { ...all false }, ...all null }

# Save the physical-data section
curl -s -X PATCH http://localhost:3000/api/porteros/me/physical-data \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"heightCm": 185, "weightKg": 78}' | jq
# → 200, { "status": "in_progress", "sections": { "physicalData": { "complete": true }, ... } }

# Save the location section
curl -s -X PATCH http://localhost:3000/api/porteros/me/location \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"latitude": 6.244, "longitude": -75.581, "city": "Medellín", "state": "Antioquia", "country": "CO", "neighborhood": "Laureles"}' | jq

# Save the availability section
curl -s -X PATCH http://localhost:3000/api/porteros/me/availability \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"radiusKm": 25}' | jq

# Save the identification text fields (partial — no photos yet)
curl -s -X PATCH http://localhost:3000/api/porteros/me/identification \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"documentType": "cedula_ciudadania", "documentNumber": "1045678901", "issueDate": "2013-07-02", "birthDate": "1995-03-14"}' | jq
# → 200, identification.complete still false (no photos yet)

# Try activating too early
curl -s -X POST http://localhost:3000/api/porteros/me/activate -H "Authorization: Bearer $TOKEN" | jq
# → 409 { "error": "portero_profile_incomplete", "missingSections": ["identification"] }

# Upload both document photos
curl -s -X POST http://localhost:3000/api/porteros/me/document-photo \
  -H "Authorization: Bearer $TOKEN" \
  -F "sideA=@/path/to/id-front.jpg" -F "sideB=@/path/to/id-back.jpg" | jq
# → 200, identification.complete now true

# Activate
curl -s -X POST http://localhost:3000/api/porteros/me/activate -H "Authorization: Bearer $TOKEN" | jq
# → 200, { "status": "active", ... }

# Any further section save now fails
curl -i -X PATCH http://localhost:3000/api/porteros/me/availability \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"radiusKm": 30}'
# → 409 { "error": "already_active", ... }
```

## Try cancelling (before activation)

```bash
# Start over on a fresh client's registration, save one section, then cancel
curl -s -X PATCH http://localhost:3000/api/porteros/me/physical-data \
  -H "Authorization: Bearer $OTHER_TOKEN" -H "Content-Type: application/json" -d '{"heightCm": 178, "weightKg": 70}'

curl -s -X POST http://localhost:3000/api/porteros/me/cancel -H "Authorization: Bearer $OTHER_TOKEN" | jq
# → 200, { "status": "not_started", ... } — all previously saved data and any uploaded photos are gone

curl -s http://localhost:3000/api/porteros/me -H "Authorization: Bearer $OTHER_TOKEN" | jq
# → 200, confirms not_started, no trace of the discarded height/weight
```

## Automated tests

```bash
npm test              # unit: handlers (fakes/mocked repositories)
npm run test:http     # supertest against /api/porteros/*, fake-backed — no real Cloudinary/Mongo calls
```
