# Contract: Client Cancellation

**Feature**: `017-client-cancel-booking` | **Spec**: [../spec.md](../spec.md)

Both endpoints are under the client router: a signed-in client with a completed profile. Only the request's own client can cancel.

## `POST /api/goalkeeper-requests/bookings/{requestId}/bookings/{bookingId}/cancel`

Cancels one booking of the request.

**Request**

```json
{ "reason": "Un amigo cubre el otro arco" }
```

`reason` is optional; if present it is a string, trimmed, 1–200 characters.

**Responses**

| Status | Body | When |
|---|---|---|
| `200` | the request (`RequestResponse`, as `GET /bookings` items without the names) | Cancelled now, or already cancelled by the client (idempotent) |
| `400 validation_failed` | | Reason too long or not a string |
| `404 request_not_found` / `404 booking_not_found` | | Unknown, malformed, another client's, or a booking of another request |
| `409 booking_not_cancellable` | `{ status }` | Already `expired`, cancelled by the system, `completed` or `goalkeeper_withdrew` |
| `409 cancellation_window_closed` | `{ bookingId, freeCancellationUntil }` | Assigned, and the free-cancellation period is over: use the goalkeeper or pay them |
| `503 cancellation_temporarily_unavailable` | | The goalkeeper's refund can't be recorded right now; `Retry-After: 60` |

## `POST /api/goalkeeper-requests/bookings/{requestId}/cancel`

Cancels the whole request: every pending and assigned booking, all or nothing.

The request body and the responses are the same as above, plus:
- `409 cancellation_window_closed` when **any** assigned booking is past its deadline: **nothing** changes, not even the pending ones (clarification 1).
- `200` when nothing is left to cancel because the client already cancelled everything (idempotent).
- `409 booking_not_cancellable` when nothing is live and the request ended otherwise (expired, "cancel all").

## Effects

- Each cancelled booking: `status: "cancelled"`. The request's `status` becomes `cancelled` when nothing live remains, and it stops blocking a new request for the same match.
- Each assigned goalkeeper:
  - gets a refund of the commission they paid, once;
  - gets a push and inbox notice, `data.type: "booking.cancelled"`: "El cliente canceló tu partido en Bello · dom 4 oct, 3:00 p. m. Te devolvimos 7.000 COP.";
  - sees the match in their agenda with `status: "cancelled"`.
- One `booking.cancelled` event per booking (`by: "client"`, `reason: "client_cancelled"`).
- The client gets no notice: they did it.
