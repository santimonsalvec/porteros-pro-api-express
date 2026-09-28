# Quickstart: Booking Expiry and "Cancel All"

**Feature**: `016-booking-expiry-cancel-all` | **Contract**: [contracts/lifecycle-changes.md](./contracts/lifecycle-changes.md)

Locally, everything runs on the every-minute local sweep (`EVENTS_MODE=local`), and pushes are logged (`PUSH_MODE=log`).

## 1. Expiry

1. C confirms a 1-goalkeeper request for 90 minutes from now; nobody accepts.
2. Wait until 30 minutes before its start (or edit `searchEndsAt` in `mongosh` to a past time).
3. Expected within about 1 minute:
   - the booking is `expired` and the request is `expired` in `GET /bookings`;
   - the log shows `bookings_expired` and a `push_sent` to C;
   - C's inbox has `request.expired`;
   - the goalkeepers' available matches no longer show it;
   - `db.goalkeeperRequests.findOne({ _id }).active` is `false`.

## 2. "Cancel all"

1. C quotes a match ≥ 2 hours ahead with 2 goalkeepers. The quote shows `cancelAllAvailable: true`. C confirms with `partialFulfillment: "cancel_all"`.
2. G accepts one booking (the commission is charged).
3. Move time: edit the request's `startsAt` in `mongosh` so start − 60 min is in the past, or wait.
4. Expected within about 1 minute:
   - both bookings are `cancelled`;
   - G's wallet has a `commission_refund` of the same amount, with `cancellation.by: "system"` and `reason: "cancel_all"`;
   - G's inbox has `booking.cancelled`, and C's has `request.cancelled`;
   - G's agenda shows the match as `cancelled`.
5. Wait another minute: no second refund and no second notice.

## 3. Late "cancel all"

Quote a match 45 minutes ahead: `cancelAllAvailable: false`. Confirming it with `cancel_all` gives `409 cancel_all_not_available`; with `keep_confirmed` it gives 201.

## 4. Manual checks (add to `_temp_pruebas.md` §10, deferred to the end of the roadmap)

- §1–§3 above against the dev cluster.
- Concurrency: G accepts at the exact second of the expiry, and at the "cancel all" evaluation. Exactly one outcome; never a charge without a refund.
- Two sweeps at once (call `/internal/sweep` twice in parallel, in pubsub mode): one transition, one refund, one notice.
