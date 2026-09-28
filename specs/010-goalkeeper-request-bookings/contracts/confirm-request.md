# Contract: `POST /api/goalkeeper-requests/bookings` (reshaped)

Confirms a quote. It creates **one request** (the match) and **one booking per goalkeeper**. It stays **idempotent per `quoteId`**. The format changes in place, with no versioning (spec clarification 1).

**Auth**: unchanged from 008: `requireAuth` + `requireClientOnly` + `requireCompleteProfile`. A missing or invalid token → `401`. A non-client or an incomplete profile → `403`.

## Request

| Field | Type | Required | Rules |
|---|---|---|---|
| `quoteId` | string | yes | As in 008. A value that isn't a UUID → `404 quote_not_found` |
| `partialFulfillment` | string | no | `keep_confirmed` (default) or `cancel_all`. Any other value → `400 validation_failed`. Ignored on a replay |

```json
{ "quoteId": "01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00", "partialFulfillment": "cancel_all" }
```

## Success

- `201 Created` when this call created the request.
- `200 OK` for a replay: identical body, same `requestId` and `bookingId`s, and bookings in their current state.

| Field | Type | Meaning |
|---|---|---|
| `requestId` | string | The request (the match) |
| `quoteId` | string | Echo |
| `status` | string | Derived: `searching` \| `partially_assigned` \| `assigned` \| `completed` \| `closed` (only `searching` in this feature) |
| `partialFulfillment` | string | `keep_confirmed` \| `cancel_all` |
| `latitude`, `longitude`, `zoneId`, `cityId`, `startsAt`, `startsAtLocal`, `timeZone`, `goalkeeperCount`, `durationMinutes` | — | Match details, same meaning as in 008 |
| `unitRate`, `subtotal`, `unitSurcharge`, `surcharge`, `total`, `currency` | integer / string | The quoted breakdown for the whole request (N goalkeepers), as in 008 |
| `cancellation.freeCancellationUntil` | string | `startsAt − freeCancellationMinutes`, UTC |
| `cancellation.freeCancellationAvailable` | boolean | `false` when the match is already inside the free-cancellation period at confirmation: assigned bookings cannot be cancelled and the goalkeeper must be paid |
| `createdAt` | string | UTC |
| `bookings[]` | array | One per goalkeeper, ordered by `bookingId` |
| `bookings[].bookingId` | string | |
| `bookings[].status` | string | `pending_assignment` (later: `assigned`, `cancelled`, `expired`, `goalkeeper_withdrew`, `completed`) |
| `bookings[].unitRate`, `.unitSurcharge`, `.total`, `.currency` | integer / string | Per-goalkeeper price; the `bookings[].total` values add up to `total` |
| `bookings[].createdAt` | string | UTC |

```json
{
  "requestId": "01925a00-1b2c-7d3e-8f40-5a6b7c8d9e0f",
  "quoteId": "01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00",
  "status": "searching",
  "partialFulfillment": "cancel_all",
  "latitude": 6.2442, "longitude": -75.5812,
  "zoneId": "zone-laureles", "cityId": "city-medellin",
  "startsAt": "2026-09-28T20:00:00.000Z", "startsAtLocal": "2026-09-28T15:00:00-05:00", "timeZone": "America/Bogota",
  "goalkeeperCount": 2, "durationMinutes": 90,
  "unitRate": 55000, "subtotal": 110000, "unitSurcharge": 5000, "surcharge": 10000, "total": 120000, "currency": "COP",
  "cancellation": { "freeCancellationUntil": "2026-09-28T19:00:00.000Z", "freeCancellationAvailable": true },
  "createdAt": "2026-09-27T18:31:02.417Z",
  "bookings": [
    { "bookingId": "01925a00-1b2d-7aaa-8bbb-000000000001", "status": "pending_assignment", "unitRate": 55000, "unitSurcharge": 5000, "total": 60000, "currency": "COP", "createdAt": "2026-09-27T18:31:02.417Z" },
    { "bookingId": "01925a00-1b2d-7aaa-8bbb-000000000002", "status": "pending_assignment", "unitRate": 55000, "unitSurcharge": 5000, "total": 60000, "currency": "COP", "createdAt": "2026-09-27T18:31:02.417Z" }
  ]
}
```

## Errors

Same `ApiError` body as the rest of the API.

| Status | `error` | When | Extra |
|---|---|---|---|
| 400 | `validation_failed` | `quoteId` missing or not a string; `partialFulfillment` not one of the two values | `fieldErrors` |
| 404 | `quote_not_found` | Unchanged from 008 | — |
| 410 | `quote_expired` | Unchanged from 008 | — |
| 409 | **`duplicate_request`** (was `duplicate_booking`) | The client already has an **active** request for that zone and start | **`requestId`** of the existing request (was `bookingId`) |
| 409 | `confirmation_in_progress` | Unchanged from 008 (`Retry-After: 1`) | — |
| 401 / 403 | — | Unchanged | — |

## Changes vs. 008 (summary for the app)

- The body is a **request with `bookings[]`** instead of a single booking. `bookingId` moves inside `bookings[]`, and the top level carries `requestId`.
- New fields: `status` (derived), `partialFulfillment`, `cancellation`.
- `duplicate_booking` / `bookingId` → `duplicate_request` / `requestId`.
