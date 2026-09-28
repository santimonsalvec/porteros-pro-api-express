# Contract: `GET /api/goalkeeper-requests/bookings` (reshaped from 009)

Lists the **caller's requests**, one per match, each with its bookings. The path, auth, query parameters, ordering, pagination rules and errors are **exactly those of the [009 contract](../../009-list-client-bookings/contracts/list-bookings.md)**, applied to requests instead of bookings.

## Request

Unchanged: `page` (≥ 1, default 1) and `pageSize` (1–50, default 20). Unknown parameters, including any user or client id, are ignored.

## Success — `200 OK`

```json
{ "items": [ /* request */ ], "page": 1, "pageSize": 20, "totalItems": 3, "totalPages": 1 }
```

- `totalItems` / `totalPages` count **requests**.
- Each item has **exactly the fields of the [confirmation success body](./confirm-request.md#success)**, plus `zoneName` and `cityName` (current names; `null` when the zone or city no longer exists).

Ordering, unchanged from 009, over the request's `startsAt`: upcoming (≥ request time) ascending, then past descending; the tie-breaker is `requestId`.

## Errors

Unchanged from 009: `400 validation_failed` for `page` / `pageSize`, `401`, `403`.
