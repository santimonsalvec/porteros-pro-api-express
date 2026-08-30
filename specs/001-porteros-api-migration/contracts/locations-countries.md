# Contract: Country Reference Data Endpoint

## `GET /api/locations/countries`

Returns the full country reference catalog (name, dial code, ISO code), for populating a country/phone-code picker on any client. Requires no authentication. Ported unchanged from the source system's `LocationsController` (implemented but not separately spec'd in the source's own `specs/` — folded into this migration's spec as User Story 5).

### Response — success

**Status**: `200 OK`

```json
{
  "countries": [
    { "countryCode": "CO", "name": "Colombia", "dialCode": "+57" }
  ]
}
```

**Contract rules** (FR-037):

- No pagination — the full catalog is returned in one response, matching the source's behavior.
- Read-only reference data; this system never writes to the underlying collection.
