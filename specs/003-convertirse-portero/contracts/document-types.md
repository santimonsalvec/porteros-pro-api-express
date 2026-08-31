# Contract: List Identification Document Types

## `GET /api/porteros/document-types`

Public, non-sensitive reference data — mirrors `GET /api/locations/countries`. Requires no authentication.

### Request

No body, no parameters.

### Response — success

**Status**: `200 OK`

```json
{
  "documentTypes": [
    { "code": "cedula_ciudadania", "name": "Cédula de ciudadanía" },
    { "code": "cedula_extranjeria", "name": "Cédula de extranjería" },
    { "code": "pasaporte", "name": "Pasaporte" }
  ]
}
```

**Contract rules** (FR-022):

- The set returned here is exactly the set of valid `documentType` values accepted by `PATCH /api/porteros/me/identification`.
- Maintained as manually-seeded reference data (data-model.md's `DocumentType` seed data) — this endpoint has no corresponding write capability in this feature, mirroring `Countries`.
