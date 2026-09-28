# Contract: Inbox, Offers and the Availability Switch

**Feature**: `015-notify-eligible-goalkeepers` | **Spec**: [../spec.md](../spec.md)

Errors use the existing `{ error, message }` shape. `401` (no body) means missing or invalid access token.

---

## Inbox (any signed-in user)

### `GET /api/notifications?page=1&pageSize=20`

`pageSize` is 1–50 (default 20); `page` is ≥ 1 (default 1). Newest first.

**`200 OK`**

```json
{
  "items": [
    {
      "notificationId": "0192…",
      "type": "booking.available",
      "title": "Partido disponible",
      "body": "Bello · sáb 4 oct, 3:00 p. m. · 90 min",
      "data": { "type": "booking.available", "requestId": "0191…", "bookingId": "0191…" },
      "createdAt": "2026-10-01T15:00:00.000Z",
      "readAt": null,
      "dismissedAt": null,
      "stillAvailable": true
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalItems": 1,
  "totalPages": 1,
  "unreadCount": 1
}
```

- `dismissedAt` and `stillAvailable` are `null` for non-offer types.
- `stillAvailable` is `true` when the request still has a booking the caller can take now (012 rules plus the switch).
- An empty inbox is `200` with `items: []`.
- `400 validation_failed`: invalid `page` or `pageSize`.

### `POST /api/notifications/{notificationId}/read`

- `204`: marked read. It's idempotent. For an offer, this also means "opened": no more reminders for it.
- `404 notification_not_found`: unknown, malformed, or someone else's.

### `POST /api/notifications/read-all`

- `204`: every unread entry of the caller is marked read. It's idempotent.

### `POST /api/notifications/{notificationId}/dismiss`

- `204`: the offer is dismissed and read. It's idempotent.
- `404 notification_not_found`.
- `409 not_an_offer`: the entry is not an offer.

---

## Availability switch (active goalkeepers)

### `PUT /api/goalkeepers/me/offers-availability`

**Request**

```json
{ "available": true }
```

**`200 OK`**

```json
{ "availableForOffers": true, "offersSent": 2 }
```

- `offersSent`: how many new offers the catch-up created and pushed. It's `0` when turning offers off, when they were already on, or when there was nothing to send.
- `400 validation_failed`: `available` is missing or not a boolean.
- `404 goalkeeper_not_found`: the caller is not an active goalkeeper.

### `GET /api/goalkeepers/me` (changed)

The response gains `availableForOffers: boolean | null`: `null` unless the registration is `active`.

---

## Changes to feature 012

### `GET /api/goalkeepers/me/available-bookings`

`unavailableReason` gains `"not_available_for_offers"`. It is checked first. With it, `items` is empty and `missingAmount` and `suspendedUntil` are `null`.

### `POST /api/goalkeepers/me/bookings/{bookingId}/accept`

New error: `409 goalkeeper_not_available` ("Turn on availability for offers to take matches."). Nothing is charged and the booking stays pending. A retry of an acceptance that already succeeded still answers `200` (replayed).

---

## Pushes sent by this feature

They follow 014's data convention.

| When | Title | Body | `data` |
|---|---|---|---|
| First notification (one match) | `Partido disponible` | `Bello · sáb 4 oct, 3:00 p. m. · 90 min` | `{ type: 'booking.available', requestId, bookingId }` |
| Reminder or catch-up, 1 open offer | same as above | same as above | same as above |
| Reminder or catch-up, N ≥ 2 open offers | `Partidos disponibles` | `Hay N partidos disponibles en tus zonas` | `{ type: 'bookings.available' }`: the app opens "available matches" |

The app marks an offer read (`POST …/read`) when the goalkeeper opens it from the inbox or taps its push.
