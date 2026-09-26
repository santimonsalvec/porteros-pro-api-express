# Contract: `POST /api/goalkeeper-requests/quote`

> **Superseded in part by feature 008** — see [`specs/008-quote-to-booking/contracts/quote-service.md`](../../008-quote-to-booking/contracts/quote-service.md). The endpoint is no longer read-only: every successful quote is stored for 3 minutes and the response adds `quoteId` and `expiresAt`. Everything else below still applies.

Calculates the total price of a goalkeeper booking. **Read-only**: creates, reserves and changes nothing (FR-020).

**Auth**: `Authorization: Bearer <access token>`; token must be a client token with a complete profile (`requireAuth` + `requireClientOnly` + `requireCompleteProfile`). Missing/invalid token → `401` (no body); non-client or incomplete profile → `403` (no body).

## Request

`Content-Type: application/json`

| Field | Type | Required | Rules |
|---|---|---|---|
| `latitude` | number | yes | Finite, −90 ≤ x ≤ 90 |
| `longitude` | number | yes | Finite, −180 ≤ x ≤ 180 |
| `startsAt` | string | yes | ISO-8601 `YYYY-MM-DDTHH:mm[:ss[.fff]][Z\|±HH:mm]`. **With an offset** → converted to that instant. **Without an offset** → read as local wall-clock time in the time zone of the city where the location is (never the caller's or the server's). Must land on a local `:00` or `:30` with zero seconds. |
| `goalkeeperCount` | integer | yes | `1` or `2` |
| `durationMinutes` | integer | yes | `60`, `90` or `120` |

All five are required; unknown extra fields are ignored. Numbers must be JSON numbers (`"6.2"` is rejected).

```json
{
  "latitude": 6.2442,
  "longitude": -75.5812,
  "startsAt": "2026-09-21T15:00:00",
  "goalkeeperCount": 2,
  "durationMinutes": 90
}
```

## Success — `200 OK`

| Field | Type | Meaning |
|---|---|---|
| `unitRate` | integer | Price per goalkeeper for the requested duration (zone rate, else city rate) |
| `goalkeeperCount` | integer | Echo of the request |
| `subtotal` | integer | `unitRate × goalkeeperCount` |
| `unitSurcharge` | integer | Lead-time surcharge **per goalkeeper** (`0` when none applies) |
| `surcharge` | integer | Surcharge charged in total: `unitSurcharge × goalkeeperCount` (the surcharge is paid once per goalkeeper) |
| `total` | integer | `subtotal + surcharge`, i.e. `(unitRate + unitSurcharge) × goalkeeperCount` |
| `currency` | string | ISO 4217 code of the **country** the location is in (e.g. `COP`); every amount above is in it |
| `startsAt` | string | Resolved start instant, UTC (`…Z`) |
| `startsAtLocal` | string | The same instant in the city's zone (`…±HH:mm`), for display |
| `timeZone` | string | The city's IANA time-zone id (e.g. `America/Bogota`) |

Amounts are integers in whole currency units.

```json
{
  "unitRate": 55000,
  "goalkeeperCount": 2,
  "subtotal": 110000,
  "unitSurcharge": 5000,
  "surcharge": 10000,
  "total": 120000,
  "currency": "COP",
  "startsAt": "2026-09-21T20:00:00.000Z",
  "startsAtLocal": "2026-09-21T15:00:00-05:00",
  "timeZone": "America/Bogota"
}
```

## Errors

Every error body is `{ "error": "<code>", "message": "<human text>", …extra }` (the existing `ApiError` shape). Clients should switch on `error`; `message` is English and not for display.

### `400` — the caller can fix the request

| `error` | When | Extra fields |
|---|---|---|
| `validation_failed` | A field is missing, has the wrong type, is out of range, is not one of the allowed values, or `startsAt` is not a valid date-time | `fieldErrors`: `{ "<field>": "<reason>" }` naming every offending field |
| `location_not_covered` | No active service zone contains the coordinates | — |
| `invalid_start_time` | `startsAt` is not on a local 30-minute mark, or (offset-less) the local time does not exist / occurs twice because of a daylight-saving change | `reason`: `not_on_slot` \| `nonexistent_local_time` \| `ambiguous_local_time` (send an explicit offset to resolve the last) |
| `start_time_in_past` | The start instant is earlier than the moment of the request | — |
| `insufficient_notice` | Less than the minimum notice remains: *there is not enough time for a goalkeeper to reach the zone* | `minNoticeMinutes` |
| `outside_booking_window` | The start's local calendar day is beyond the allowed window | `bookingWindowDays` |

### `422` — well-formed, but the service is not set up for that area or duration

| `error` | When | Extra fields |
|---|---|---|
| `time_zone_not_configured` | The city that owns the zone has no time zone | — |
| `service_not_configured` | Neither the city nor its country defines one or more of the booking window, minimum notice, or surcharge tiers — or the country has no currency (or the city's country cannot be determined) | `missing`: subset of `bookingWindowDays`, `minNoticeMinutes`, `leadTimeSurcharge`, `currency` (in that order) |
| `rate_not_configured` | Neither the zone nor its city has a rate for the requested duration | — |

No price is ever returned with an error, and a missing value is never treated as zero.

### `500`

`internal_error` (generic; no internals leaked). Also raised for corrupt configuration (a malformed rate/settings document, an invalid time-zone identifier, a zone whose city does not exist) — details go to the server log only.

## Evaluation order

`validation_failed` → `location_not_covered` → `time_zone_not_configured` → `invalid_start_time` → `start_time_in_past` → `service_not_configured` → `insufficient_notice` → `outside_booking_window` → `rate_not_configured`. The first failing rule is the one reported.

## Worked examples (Colombia: window 2 days, notice 30 min, tiers `[0,60)→10.000`, `[60,120)→5.000`, `[120,∞)→0`; zone rate 60 min = 40.000)

| Request "now" (Bogota) | `startsAt` | Count / duration | Result |
|---|---|---|---|
| Sep 21 13:30 | Sep 21 15:00 | 1 / 60 | lead 90 → subtotal 40.000, surcharge 5.000, total **45.000** |
| Sep 21 13:30 | Sep 21 15:00 | 2 / 60 | lead 90 → subtotal 80.000, surcharge 10.000 (5.000 × 2), total **90.000** |
| Sep 21 13:00 | Sep 21 15:00 | 2 / 60 | lead 120 → subtotal 80.000, surcharge 0, total **80.000** |
| Sep 21 14:29 | Sep 21 15:00 | 1 / 60 | lead 31 → subtotal 40.000, surcharge 10.000, total **50.000** |
| Sep 21 14:29 | Sep 21 15:00 | 2 / 60 | lead 31 → subtotal 80.000, surcharge 20.000 (10.000 × 2), total **100.000** |
| Sep 21 14:31 | Sep 21 15:00 | 1 / 60 | lead 29 → `400 insufficient_notice` |
| Sep 21 14:10 | Sep 21 14:30 | 1 / 60 | lead 20 → `400 insufficient_notice` (earliest valid start is 15:00) |
| Sep 21 13:00 | Sep 21 15:15 | 1 / 60 | `400 invalid_start_time` (`not_on_slot`) |
| Sep 21 13:00 | Sep 23 00:00 | 1 / 60 | `400 outside_booking_window` |
| Sep 21 13:00 | Sep 22 23:30 | 1 / 60 | allowed (last minute of "tomorrow") |
