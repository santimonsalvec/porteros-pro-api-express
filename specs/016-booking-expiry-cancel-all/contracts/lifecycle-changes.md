# Contract: What Changes for the App

**Feature**: `016-booking-expiry-cancel-all` | **Spec**: [../spec.md](../spec.md)

016 adds no endpoint. It changes existing responses, adds one refusal, and adds new pushes and inbox types.

## `POST /api/goalkeeper-requests/quote` (changed response)

The quote gains:

```json
{
  "cancelAllAvailable": true,
  "cancelAllUntil": "2026-10-04T19:00:00.000Z"
}
```

- `cancelAllUntil` = start − free-cancellation period.
- `cancelAllAvailable` = the quote was issued before `cancelAllUntil`.
- The app hides the "cancel all" option when it's `false`.

## `POST /api/goalkeeper-requests/bookings` (new refusal)

With `partialFulfillment: "cancel_all"` after `cancelAllUntil`:

```json
409 { "error": "cancel_all_not_available", "message": "…", "cancelAllUntil": "2026-10-04T19:00:00.000Z" }
```

Nothing is created and the quote stays valid, so the client can confirm it again with `keep_confirmed`. A retry of a confirmation that already succeeded still answers 200 (replayed).

## Request views (`GET /api/goalkeeper-requests/bookings`, confirmation responses)

- `status` gains `expired` (no goalkeeper found) and `cancelled` (cancelled by "cancel all").
- Each booking's `status` can be `expired` or `cancelled`.

## Goalkeeper agenda (`GET /api/goalkeepers/me/bookings`)

A booking cancelled by "cancel all" stays listed with `status: "cancelled"`.

## Pushes and inbox entries

They follow 014's `data` convention. Texts are in Spanish, times in the city's time zone.

| `data.type` | To | Title | Body (example) | `data` |
|---|---|---|---|---|
| `request.expired` | client | `Sin portero para tu partido` | `No logramos hallar un portero para tu partido en Bello · dom 4 oct, 3:00 p. m.` | `{ type, requestId }` |
| `request.partially_expired` | client | `Portero confirmado parcialmente` | `Conseguimos 1 de 2 porteros para tu partido en Bello · dom 4 oct, 3:00 p. m.` | `{ type, requestId }` |
| `request.cancelled` | client | `Solicitud cancelada` | `Cancelamos tu solicitud en Bello · dom 4 oct, 3:00 p. m.: no se confirmaron todos los porteros a tiempo.` | `{ type, requestId }` |
| `booking.cancelled` | goalkeeper | `Partido cancelado` | `Se canceló tu partido en Bello · dom 4 oct, 3:00 p. m. Te devolvimos 7.000 COP.` | `{ type, requestId, bookingId }` |

The app opens the request (client) or the agenda (goalkeeper).

## Events (internal, feature 013)

`booking.expired` and `booking.cancelled` (payloads in data-model.md) are published to `booking-events`, and to 013's delivery log.
