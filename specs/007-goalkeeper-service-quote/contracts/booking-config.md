# Contract: `GET /api/goalkeeper-requests/config`

What a client may pick for a pitch, so an app can build its date/time/count/duration selectors without hardcoding limits and without trusting the phone's clock. **Read-only.** Companion of [`POST /quote`](./quote-service.md): it resolves the location exactly like the quote does (the same shared steps), so it refuses exactly where a quote would refuse, and a request that stays within what it reports is accepted by `/quote`.

**Auth**: same as `/quote` — `Authorization: Bearer <access token>` of a client with a complete profile. Missing/invalid token → `401` (no body); non-client or incomplete profile → `403` (no body).

## Request

Query string, both required (the pitch the client has chosen):

| Parameter | Type | Rules |
|---|---|---|
| `latitude` | number | Finite, −90 ≤ x ≤ 90 |
| `longitude` | number | Finite, −180 ≤ x ≤ 180 |

```bash
curl -X GET "{baseUrl}/api/goalkeeper-requests/config?latitude=6.2034&longitude=-75.5657" \
  -H "Authorization: Bearer {accessToken}"
```

## Success — `200 OK`

| Field | Type | Meaning |
|---|---|---|
| `timeZone` | string | The city's IANA time zone |
| `now` | string | "Now" per the server, in the city's local time with its offset (`…±HH:mm`). Use it instead of the phone's clock |
| `bookingWindowDays` | integer | Today plus the next `N − 1` local calendar days (configured per country/city) |
| `availableDates` | string[] | The bookable local dates (`YYYY-MM-DD`), starting today, in the city's time zone |
| `minNoticeMinutes` | integer | Minimum notice before the start (configured per country/city) |
| `slotStepMinutes` | integer | Start times sit on multiples of this many minutes of the city's local time (`30` ⇒ :00 and :30) |
| `earliestStartsAt` | string \| null | The soonest start a quote accepts right now: `now + minNoticeMinutes`, rounded **up** to the next slot mark in the city's local time, as local time with offset. `null` when that moment is already outside the booking window (nothing can be booked at the moment) |
| `goalkeeperCount` | `{ min, max }` | Allowed goalkeepers per booking (fixed: 1 to 2) |
| `durationOptions` | integer[] | Allowed durations in minutes (fixed: 60, 90, 120) |
| `currency` | string | The country's currency; every quote amount is in it |

```json
{
  "timeZone": "America/Bogota",
  "now": "2026-09-21T13:00:00-05:00",
  "bookingWindowDays": 2,
  "availableDates": ["2026-09-21", "2026-09-22"],
  "minNoticeMinutes": 30,
  "slotStepMinutes": 30,
  "earliestStartsAt": "2026-09-21T13:30:00-05:00",
  "goalkeeperCount": { "min": 1, "max": 2 },
  "durationOptions": [60, 90, 120],
  "currency": "COP"
}
```

`bookingWindowDays`, `minNoticeMinutes` and `currency` are **data** (per country, with optional per-city override); `goalkeeperCount`, `durationOptions` and `slotStepMinutes` are **code constants** shared with the quote's validation (`bookingLimits.ts`), so they cannot drift apart.

## Errors

Same shape and codes as the quote (`{ "error": "<code>", "message": "<text>", …extra }`); no configuration is ever returned with an error.

| Status | `error` | When | Extra fields |
|---|---|---|---|
| `400` | `validation_failed` | A parameter is missing, empty, not a number or out of range | `fieldErrors`: `{ "<parameter>": "<reason>" }` naming every offending parameter |
| `400` | `location_not_covered` | No active service zone contains the coordinates | — |
| `422` | `time_zone_not_configured` | The city that owns the zone has no time zone | — |
| `422` | `service_not_configured` | Neither the city nor its country defines the booking window, minimum notice or surcharge tiers, or the country has no currency (or its country cannot be determined) | `missing`: subset of `bookingWindowDays`, `minNoticeMinutes`, `leadTimeSurcharge`, `currency` |
| `500` | `internal_error` | Corrupt configuration (details only in the server log) | — |

`service_not_configured` also fires when only the surcharge tiers are missing, even though `/config` does not return them: a quote would be refused there, so `/config` refuses too.
