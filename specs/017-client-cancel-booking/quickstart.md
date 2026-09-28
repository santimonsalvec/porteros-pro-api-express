# Quickstart: Client Cancels Bookings

**Feature**: `017-client-cancel-booking` | **Contract**: [contracts/client-cancel.md](./contracts/client-cancel.md)

Locally with `EVENTS_MODE=local` and `PUSH_MODE=log`. `$TC` is the client's token, `$TG` the goalkeeper's.

## 1. Cancel a searching booking

```bash
curl -s -X POST "$API/goalkeeper-requests/bookings/$REQ/bookings/$B2/cancel" -H "Authorization: Bearer $TC" -H "$H" -d '{"reason":"Un amigo cubre el arco"}' | jq '.bookings[] | {bookingId, status}'
```

**Expected**: B2 is `cancelled`. It's gone from the goalkeepers' available matches. No wallet movement.

## 2. Cancel a taken booking in time

G accepts B1 more than 60 minutes before the start. The client cancels B1.

**Expected**:
- `200`, B1 `cancelled`;
- G's wallet has a `commission_refund` of 7.000 with `cancellation.by: "client"` and the reason;
- G's balance is back where it was;
- the log shows `push_sent` to G; G's inbox has `booking.cancelled` ("El cliente canceló tu partido…");
- G's agenda shows B1 `cancelled`.

## 3. Too late

With less than 60 minutes to go, cancel an assigned booking, then the whole request.

**Expected**: both give `409 cancellation_window_closed` with the deadline, and nothing changes: the pending booking of the request stays pending too.

## 4. Manual checks (add to `_temp_pruebas.md` §11, deferred to the end of the roadmap)

- §1–§3 against the dev cluster.
- Repeat a cancellation: the same answer, no second refund or notice.
- Concurrency: G accepts while the client cancels the same booking. One coherent outcome; never a charge without its refund.
- "Cancel all" request: the client cancels one booking; at start − 60 only the other one is evaluated (kept if assigned).
