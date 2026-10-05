# Contract: Match format, tiered pricing and offer dismissal

**Feature**: `024-match-format-pricing` | **Consumer**: `porteros_pro_app`
(`specs/024-match-format-pricing/contracts/match-format.md` points here).

Every endpoint keeps its existing auth and error conventions
(`{ error, message, fieldErrors? }`). Only the changes are listed.

## §0 Shared values

| Value | JSON | App label | Offer tag |
|---|---|---|---|
| modality | `micro_futsal` | Micro / Futsal | `MICRO / FUTSAL` |
| modality | `futbol_medio` | Fútbol medio | `FÚTBOL MEDIO · F5–F9` |
| modality | `futbol_11` | Fútbol 11 | `FÚTBOL 11` |
| modality | `any` | Cualquiera | `ABIERTO / CUALQUIERA` |
| level | `recreational` | Amateur / Amistoso | — |
| level | `competitive` | Torneo | — |

`MatchFormat` (every response that describes a match):

```json
"matchFormat": {
  "modality": "futbol_11",
  "level": "competitive",
  "surface": { "id": "synthetic_grass", "name": "Grama sintética" }
}
```

`matchFormat` is `null` for requests created before this feature. The surface
`name` is the one stored when the quote was issued.

## §1 `GET /api/goalkeeper-requests/config` — adds `surfaces`

```json
{
  "...": "unchanged fields",
  "surfaces": [
    { "id": "synthetic_grass", "name": "Grama sintética" },
    { "id": "natural_grass", "name": "Grama natural" },
    { "id": "hard_court", "name": "Asfalto/Placa" },
    { "id": "wood", "name": "Madera" },
    { "id": "dirt", "name": "Arena" }
  ]
}
```

Only `active: true` documents of `matchSurfaces`, sorted by `order` then
`name`. An empty list is valid JSON, but the app treats it as "unexpected"
(nothing can be quoted).

## §2 `POST /api/goalkeeper-requests/quote` — three new required fields

```json
{
  "latitude": 6.2034, "longitude": -75.5657,
  "startsAt": "2026-09-21T15:00:00",
  "goalkeeperCount": 2, "durationMinutes": 90,
  "modality": "futbol_11",
  "surfaceId": "synthetic_grass",
  "level": "competitive"
}
```

| Field | Validation (zod, controller) | Error |
|---|---|---|
| `modality` | one of §0 | `400 validation_failed`, `fieldErrors.modality` |
| `level` | one of §0 | `400 validation_failed`, `fieldErrors.level` |
| `surfaceId` | non-empty string | `400 validation_failed`, `fieldErrors.surfaceId` |
| `surfaceId` | exists and `active` (application layer) | `400 validation_failed`, `fieldErrors.surfaceId` = "Esa superficie ya no está disponible. Elige otra." |

The `200` body gains `matchFormat` (§0). `unitRate` is now the tiered rate
(§5). Everything else is unchanged.

## §3 `POST /api/goalkeeper-requests/bookings` and `GET …/bookings`

No new request field: the format travels inside the stored quote. Each request
in both responses gains `matchFormat` (§0, nullable).

## §4 Goalkeeper lists and pushes

- `GET /api/goalkeepers/me/available-bookings` items and
  `GET /api/goalkeepers/me/bookings` (agenda) items gain `matchFormat`.
- Offer push (`booking.available`) and its inbox entry:
  - title: `Partido disponible · Fútbol 11` (modality label; `Partido
    disponible` when `matchFormat` is null; `Partido disponible · Abierto` for `any`).
  - body: `Bello · dom 4 oct, 3:00 p. m. · 90 min · Grama sintética · Torneo`
    (`Amateur`/`Torneo` short forms).
  - `data` unchanged.

## §5 Rate and commission resolution (server only)

Input: the zone, its anchor city (and, for commissions, the country), the
duration (rates only) and `(modality, level)`.

Candidates, in order:
- `modality != any`: `(modality, level)`, `(modality, —)`, `(—, —)`.
- `modality == any`: `(—, —)`.

Geography first: for each geographic level from the most specific (zone →
city → country) try every candidate; the first document found wins. No match
at any level → rates: `rate_not_configured`; commission:
`service_not_configured` (unchanged outcomes).

Documents with `level` but no `modality` are invalid configuration
(`InvalidConfigurationError`).

## §6 `POST /api/goalkeepers/me/bookings/{bookingId}/dismiss` (new)

No body. Marks the booking's **whole request** as dismissed by this
goalkeeper.

| Status | Body | When |
|---|---|---|
| `200` | `{ "dismissed": true }` | Recorded, or already recorded (idempotent), or the booking is no longer open (taken, cancelled, expired) |
| `404` | `{ "error": "booking_not_found" }` | No such booking |
| `404` | `{ "error": "goalkeeper_not_found" }` | Caller is not a goalkeeper (same as every `/goalkeepers/me/*` route) |
| `409` | `{ "error": "booking_held", "message": "Ya tienes este partido. Si no puedes ir, retírate desde tu agenda." }` | The goalkeeper holds a booking of that request (they must withdraw instead) |

Effect: every booking of the request — and every replacement created later —
is excluded for that goalkeeper from `available-bookings`, accept, and offer
pushes/reminders.
