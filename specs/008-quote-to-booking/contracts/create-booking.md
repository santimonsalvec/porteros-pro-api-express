# Contract: `POST /api/goalkeeper-requests/bookings`

Turns a quote the caller received into a booking at exactly the quoted price. **Idempotent per `quoteId`**: however many times the same quote is confirmed, one booking exists and every successful call returns it.

**Auth**: `Authorization: Bearer <access token>`, the same chain as `/quote` (`requireAuth` + `requireClientOnly` + `requireCompleteProfile`). Missing/invalid token → `401` (no body). Non-client or incomplete profile → `403` (no body).

## Request

`Content-Type: application/json`

| Field | Type | Required | Rules |
|---|---|---|---|
| `quoteId` | string | yes | The `quoteId` returned by `POST /quote`. A string that isn't a UUID is answered `404 quote_not_found`, not `400` |

Every other field is ignored. Price and match details can't be sent or overridden (FR-007).

```json
{ "quoteId": "01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00" }
```

## Success

`201 Created` when this call created the booking. `200 OK` when the booking already existed (a retry or a double tap). The body is identical in both cases, and `bookingId` is the same for every call with the same `quoteId`.

| Field | Type | Meaning |
|---|---|---|
| `bookingId` | string | The booking's id |
| `quoteId` | string | Echo of the confirmed quote |
| `status` | string | `pending_assignment`: confirmed, awaiting goalkeeper assignment |
| `latitude`, `longitude` | number | Pitch location, from the quote |
| `zoneId`, `cityId` | string | Resolved at quote time |
| `startsAt` | string | Start instant, UTC (`…Z`) |
| `startsAtLocal` | string | Same instant in the city's zone (`…±HH:mm`) |
| `timeZone` | string | IANA id |
| `goalkeeperCount` | integer | `1` or `2` |
| `durationMinutes` | integer | `60`, `90` or `120` |
| `unitRate`, `subtotal`, `unitSurcharge`, `surcharge`, `total` | integer | Exactly the quote's breakdown, in whole currency units |
| `currency` | string | ISO 4217 |
| `createdAt` | string | When the booking was created, UTC |

```json
{
  "bookingId": "01924f6f-0a2d-7e11-8b3c-5d6e7f809a1b",
  "quoteId": "01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00",
  "status": "pending_assignment",
  "latitude": 6.2442,
  "longitude": -75.5812,
  "zoneId": "zone-laureles",
  "cityId": "city-medellin",
  "startsAt": "2026-09-21T20:00:00.000Z",
  "startsAtLocal": "2026-09-21T15:00:00-05:00",
  "timeZone": "America/Bogota",
  "goalkeeperCount": 2,
  "durationMinutes": 90,
  "unitRate": 55000,
  "subtotal": 110000,
  "unitSurcharge": 5000,
  "surcharge": 10000,
  "total": 120000,
  "currency": "COP",
  "createdAt": "2026-09-21T18:31:02.417Z"
}
```

## Errors

Same `ApiError` body shape as the rest of the API: `{ "error": "<code>", "message": "<English, not for display>", …extra }`. Clients switch on `error`.

| Status | `error` | When | Extra | App should |
|---|---|---|---|---|
| 400 | `validation_failed` | `quoteId` missing or not a string | `fieldErrors` | Fix the request |
| 404 | `quote_not_found` | No quote or booking with that id **for this client**: never existed, malformed id, already removed after expiry, or belongs to another client (all indistinguishable) | — | Request a new quote |
| 410 | `quote_expired` | The quote is past its expiry but hasn't been removed yet | — | Request a new quote (same as 404) |
| 409 | `duplicate_booking` | The caller already has a booking for the same zone and start instant (created from another quote). The quote is left untouched | `bookingId` of the existing booking | Show the existing booking |
| 409 | `confirmation_in_progress` | Another confirmation of this quote is in flight and hasn't committed | `Retry-After: 1` header | Retry the same request |
| 500 | `internal_error` | Database unavailable, transaction failed, corrupt data | — | Retry later. Nothing was booked unless a later retry returns a booking |

A refused call never creates a booking and never changes or deletes a quote (FR-021). A `500` leaves either both changes applied or neither (FR-011), so retrying with the same `quoteId` is always safe.

## Evaluation order

1. Validate the body (`400`).
2. `quoteId` not a UUID → `404` (no database access).
3. The caller already has a booking for `quoteId` → `200` (replay, no transaction).
4. Transaction: claim (delete) the caller's unexpired quote, insert the booking → `201`.
   Unique `client/zone/start` violation → `409 duplicate_booking`.
5. Nothing claimed: booking now exists → `200`; quote exists and is expired → `410`; quote exists and isn't expired → `409 confirmation_in_progress`; otherwise → `404`.

## Worked examples (validity 3 min; quote Q issued 18:30:00Z to client A for zone Z at 20:00Z)

| Call | At | Result |
|---|---|---|
| A confirms Q | 18:31:00 | `201`, booking B1; Q deleted |
| A confirms Q again (lost response) | 18:31:05 | `200`, B1 |
| A confirms Q again | next day | `200`, B1 (replay after expiry) |
| A confirms Q twice at the same instant | 18:31:00 | one `201` B1, the other `200` B1 (or, rarely, `409 confirmation_in_progress`, then `200` on retry) |
| B confirms Q | 18:31:00 | `404 quote_not_found`; Q untouched |
| A confirms Q | 18:33:00 (= expiry), before TTL removal | `410 quote_expired` |
| A confirms Q | 18:35:00, after TTL removal | `404 quote_not_found` |
| A confirms Q2 (another quote, zone Z, 20:00Z) after B1 exists | any time Q2 is valid | `409 duplicate_booking`, `bookingId: B1`; Q2 untouched |
