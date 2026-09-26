# Contract: `GET /api/goalkeeper-requests/bookings`

Lists the **caller's own** bookings, one page at a time: upcoming matches first (soonest first), then past matches (most recent first).

**Auth**: `Authorization: Bearer <access token>`, the same chain as `POST /quote` and `POST /bookings` (`requireAuth` + `requireClientOnly` + `requireCompleteProfile`). Missing/invalid token → `401` (no body). Non-client or incomplete profile → `403` (no body).

The client is **always** the token's subject. No parameter selects another user: any `clientId`, `userId` or other unknown parameter is ignored.

## Request

Query parameters only; no body.

| Param | Type | Required | Default | Rules |
|---|---|---|---|---|
| `page` | integer | no | `1` | Digits only, ≥ 1. A page past the last one is **not** an error |
| `pageSize` | integer | no | `20` | Digits only, 1–50 |

```http
GET /api/goalkeeper-requests/bookings?page=1&pageSize=20
Authorization: Bearer eyJ…
```

## Success — `200 OK`

| Field | Type | Meaning |
|---|---|---|
| `items` | array | The bookings on this page, in list order (may be empty) |
| `page` | integer | The page returned (echo, default applied) |
| `pageSize` | integer | The page size applied (echo, default applied) |
| `totalItems` | integer | All of the caller's bookings |
| `totalPages` | integer | `ceil(totalItems / pageSize)`; `0` when `totalItems` is `0` |

Each element of `items` has **exactly the fields of the `POST /bookings` success body** ([008 contract](../../008-quote-to-booking/contracts/create-booking.md#success)), plus:

| Field | Type | Meaning |
|---|---|---|
| `zoneName` | string \| null | The zone's **current** name; `null` if the zone no longer exists |
| `cityName` | string \| null | The city's **current** name; `null` if the city no longer exists |

Amounts, match details and `status` are the stored values. Nothing is recalculated.

```json
{
  "items": [
    {
      "bookingId": "01924f6f-0a2d-7e11-8b3c-5d6e7f809a1b",
      "quoteId": "01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00",
      "status": "pending_assignment",
      "latitude": 6.2442,
      "longitude": -75.5812,
      "zoneId": "zone-laureles",
      "zoneName": "Laureles",
      "cityId": "city-medellin",
      "cityName": "Medellín",
      "startsAt": "2026-09-27T20:00:00.000Z",
      "startsAtLocal": "2026-09-27T15:00:00-05:00",
      "timeZone": "America/Bogota",
      "goalkeeperCount": 2,
      "durationMinutes": 90,
      "unitRate": 55000,
      "subtotal": 110000,
      "unitSurcharge": 5000,
      "surcharge": 10000,
      "total": 120000,
      "currency": "COP",
      "createdAt": "2026-09-25T18:31:02.417Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalItems": 1,
  "totalPages": 1
}
```

No bookings, or a page past the end:

```json
{ "items": [], "page": 4, "pageSize": 20, "totalItems": 45, "totalPages": 3 }
```

## Errors

Same `ApiError` body as the rest of the API: `{ "error": "<code>", "message": "…", …extra }`.

| Status | `error` | When | Extra |
|---|---|---|---|
| 400 | `validation_failed` | `page` or `pageSize` isn't all digits, `page` < 1, `pageSize` < 1 or > 50, or a parameter is repeated | `fieldErrors: { page?: string, pageSize?: string }` |
| 401 | — | Missing or invalid token | — |
| 403 | — | Not a client, or incomplete profile | — |
| 500 | `internal_error` | Unexpected failure | — |

A missing zone or city **never** causes an error (FR-013).

## Ordering guarantee

- **Upcoming**: `startsAt ≥ request time`, ascending, ties broken by `bookingId` ascending.
- **Past**: `startsAt < request time`, descending, ties broken by `bookingId` descending.

Page `n + 1` continues exactly where page `n` ended, provided no booking was created and no match started between the two requests. Otherwise items may shift by a position; refresh from page 1.

## Worked example (request time 2026-09-25T18:00Z, client with 45 bookings: 3 upcoming, 42 past, pageSize 20)

| Request | `items` | Totals |
|---|---|---|
| `page=1` | the 3 upcoming (soonest first), then the 17 most recent past | 45 / 3 |
| `page=2` | past #18–#37 | 45 / 3 |
| `page=3` | past #38–#42 (5 items) | 45 / 3 |
| `page=4` | `[]` | 45 / 3 |
| `pageSize=51` | `400 validation_failed`, `fieldErrors.pageSize` | — |
| `page=0` | `400 validation_failed`, `fieldErrors.page` | — |
| `clientId=<other>` | same as `page=1` (param ignored) | 45 / 3 |
