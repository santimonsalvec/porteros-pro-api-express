# Contract: Search Cities

## `GET /api/locations/cities?q=<text>`

Typeahead search for the goalkeeper availability screen's city picker. Requires a valid internal access token (`requireAuth`) — no client-role or complete-profile requirement (research.md §6).

### Request

Query parameter `q` (string, optional). An empty, missing, or whitespace-only `q` returns an empty list without querying the database (research.md §4).

### Response — success

**Status**: `200 OK`

```json
{
  "cities": [
    { "id": "city-envigado", "name": "Envigado", "region": "Antioquia", "hasZones": true },
    { "id": "city-el-retiro", "name": "El Retiro", "region": "Antioquia", "hasZones": false }
  ]
}
```

| Field | Notes |
|---|---|
| `cities` | Up to 15 matches, no pagination (research.md §4) |
| `cities[].hasZones` | `true` iff the city's resolved anchor (research.md §2) has at least one `active` zone |

An empty `q` or no matches both return `{ "cities": [] }` — never an error.
