# Contract: goalkeeper available matches, acceptance and agenda

**Auth**: `Authorization: Bearer <access token>`, the goalkeeper router's `/me` chain. The caller must be an **active goalkeeper**, otherwise → `404 goalkeeper_not_found`. The goalkeeper is always the token's subject.

Pagination (`page`, `pageSize`) behaves as in the other lists: defaults 1/20, maximum page size 50, and `400 validation_failed` with `fieldErrors`.

## `GET /api/goalkeepers/me/available-bookings?page=&pageSize=`

`200 OK`

| Field | Type | Meaning |
|---|---|---|
| `items` | array | Takeable bookings, soonest start first |
| `page`, `pageSize`, `totalItems`, `totalPages` | integer | |
| `unavailableReason` | `null` \| `'insufficient_funds'` \| `'suspended'` | Why the list is empty regardless of the matches |
| `missingAmount` | integer \| null | With `insufficient_funds` |
| `suspendedUntil` | string \| null | With `suspended` (UTC) |

Item:

| Field | Type |
|---|---|
| `bookingId`, `requestId` | string |
| `zoneId`, `zoneName`, `cityId`, `cityName` | string / string \| null |
| `startsAt`, `startsAtLocal`, `timeZone` | string |
| `durationMinutes` | integer |
| `goalkeeperCount` | integer (how many goalkeepers the request asked for) |
| `earnings` | integer (the booking price the client pays the goalkeeper: rate + surcharge) |
| `commission` | integer (the booking's fixed commission) |
| `currency` | string |

No client data.

## `POST /api/goalkeepers/me/bookings/:bookingId/accept`

No body.

- `201 Created`: accepted now (the commission was charged).
- `200 OK`: already assigned to this goalkeeper (nothing charged again).

The body in both cases is the **agenda item** below.

| Status | `error` | When | Extra |
|---|---|---|---|
| 409 | `booking_already_taken` | Another goalkeeper got it | — |
| 409 | `search_ended` | `now ≥ startsAt − travel margin` | — |
| 409 | `zone_not_enabled` | The zone is not among the goalkeeper's enabled zones | — |
| 409 | `insufficient_funds` | The balance doesn't cover the booking's commission | `missingAmount` |
| 409 | `schedule_conflict` | It clashes with one of the goalkeeper's assigned bookings | `conflictingBookingId` |
| 409 | `own_request` | The goalkeeper created that request as a client | — |
| 409 | `same_request` | The goalkeeper already holds another booking of that request | — |
| 403 | `goalkeeper_suspended` | Active suspension | `suspendedUntil` |
| 404 | `booking_not_available` | Unknown or malformed id, cancelled, expired or completed | — |
| 404 | `goalkeeper_not_found` | Not an active goalkeeper | — |

## `GET /api/goalkeepers/me/bookings?page=&pageSize=` (agenda)

`200 OK`: `{ items, page, pageSize, totalItems, totalPages }`. Upcoming bookings come first (soonest first), then past ones (most recent first).

Agenda item = available item fields, plus:

| Field | Type |
|---|---|
| `status` | string (`assigned`, later `completed`, `cancelled`, `goalkeeper_withdrew`) |
| `assignedAt` | string |
| `client` | `{ firstName, lastName, whatsApp }` (`whatsApp` = `"<countryCallingCode> <number>"`) |
| `latitude`, `longitude` | number (the pitch) |

## Change to `GET /api/goalkeeper-requests/bookings` and the `POST /bookings` replay (010 contract)

Each element of `bookings[]` gains:
- `goalkeeper`: `{ firstName, lastName, whatsApp }` when the booking is assigned, otherwise `null`;
- `assignedAt`: string or `null`.

The request-level `status` already reflects assignments (`partially_assigned`, `assigned`).

## Change to `POST /api/goalkeeper-requests/quote` (refusals only)

The existing refusal `422 service_not_configured` can now list `"commission"` in `missing`. The success body is unchanged: the commission is not shown to the client.
