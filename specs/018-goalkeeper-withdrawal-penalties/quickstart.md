# Quickstart: Goalkeeper Withdrawal, Penalties and Suspensions

**Feature**: `018-goalkeeper-withdrawal-penalties` | **Contract**: [contracts/withdrawals.md](./contracts/withdrawals.md)

Run it locally with `EVENTS_MODE=local` and `PUSH_MODE=log`. `$TC` is the client's token, `$TG` goalkeeper G's, `$TH` another goalkeeper H's (same zone), and `$TA` an admin's.

## 1. Withdraw in time (no suspension)

G accepts B1 of a match 5 hours ahead.

```bash
curl -s -X POST "$API/goalkeepers/me/bookings/$B1/withdraw" -H "Authorization: Bearer $TG" -H "$H" -d '{"reason":"Me salió un viaje"}' | jq '.status, .withdrawal'
```

**Expected**:
- `goalkeeper_withdrew`, `late: false`, `penalties: []`, `replacementCreated: true`;
- G's balance is unchanged (the commission stays charged);
- the client's request shows B1 withdrawn and a new pending booking with the same price;
- the log shows `push_sent` to the client ("Ya estamos buscando otro portero") and an offer push to H, not to G;
- H's available matches list the replacement; G's don't.

## 2. Late withdrawal

G accepts a match 90 minutes ahead, then withdraws.

**Expected**:
- `late: true`, a `late` penalty of 3 days, `suspendedUntil` = now + 3 days;
- G's available matches answer `unavailableReason: "suspended"`;
- G's inbox has `goalkeeper.suspended` with the end date.

## 3. Too late for a replacement

G withdraws 20 minutes before the start (the search ended at start − 30).

**Expected**: `replacementCreated: false`, and the client's notice says no other goalkeeper could be found.

## 4. Weekly limit

Three in-time withdrawals within 7 days.

**Expected**: the 3rd one has a `weekly_limit` penalty of 7 days. If it's also late, `suspendedUntil` is the later of the two ends, not their sum.

## 5. Admin reversal

```bash
curl -s -X POST "$API/admin/goalkeepers/$G/withdrawals/$W/reversal" -H "Authorization: Bearer $TA" -H "$H" \
  -d '{"refund":true,"liftSuspension":true,"reason":"Incapacidad médica"}' | jq
```

**Expected**:
- a `commission_refund` with actor admin and the reason;
- `suspendedUntil: null` (or the next penalty in force);
- G sees available matches again;
- repeating the call changes nothing;
- that withdrawal no longer counts toward the weekly limit.

## 6. Manual checks (add to `_temp_pruebas.md` §12, deferred to the end of the roadmap)

- §1–§5 against the dev cluster, with the push reaching real devices.
- Concurrency: the client cancels B1 while G withdraws from it. One coherent outcome: either a refund and no penalty, or a penalty and no refund.
- A "cancel all" request: G withdraws before start − 60 and nobody takes the replacement. At start − 60 the whole request is cancelled, and the other goalkeeper is refunded.
- A dismissed offer of the original booking comes back as an unread offer for the replacement.
