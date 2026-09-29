# Quickstart: Match Close, Minimal Rating and No-shows

**Feature**: `021-match-close-rating-no-show` | **Contract**: [contracts/ratings-and-cases.md](./contracts/ratings-and-cases.md)

Run it locally with `EVENTS_MODE=local` and `PUSH_MODE=log`. `$TC` is the client's token, `$TG` the goalkeeper's and `$TA` an admin's. G holds booking `$B` of a 90-minute match at `$START`.

## 1. Close

Move the clock to `$START + 90 min` and run `POST /internal/sweep`.

**Expected**:
- `$B` is `completed`, and the request shows `completed`;
- `GET /api/ratings/pending` lists `$B` for both C and G.

## 2. Ratings

```bash
curl -s -X POST "$API/ratings/bookings/$B" -H "Authorization: Bearer $TC" -H "$H" -d '{"answer":true,"stars":5,"comment":"Puntual"}'
```

**Expected**:
- `201`;
- a repeat gives `409 already_rated`;
- C's pending list no longer has `$B`;
- G's "no" (`answer: false`) opens a `payment_not_received` case.

## 3. No-show by silence

Another booking without a check-in and without a client rating. Move to `$START + 90 + 60 min` and sweep.

**Expected**:
- the booking has `attendance: no_show`;
- G is suspended 3 days (their available matches say `suspended`);
- G's inbox has `goalkeeper.no_show`;
- G's withdrawals history has an item with `kind: "no_show"`.

## 4. No-show by the client's "no"

Without a check-in, C answers `answer: false`.

**Expected**: an immediate no-show (suspension), plus an open `goalkeeper_no_show` case.

## 5. Cases

```bash
curl -s "$API/admin/cases?status=open" -H "Authorization: Bearer $TA" | jq
curl -s -X POST "$API/admin/cases/$CASE/resolve" -H "Authorization: Bearer $TA" -H "$H" -d '{"note":"Se verificó con ambas partes"}'
```

**Expected**: the case is resolved, and a repeat gives `409 case_already_resolved`. To lift the penalty, use 018's reversal on the `noShowIncidentId`.

## 6. Manual checks (add to `_temp_pruebas.md` §15, deferred to the end of the roadmap)

- §1–§5 against the dev cluster.
- The app shows the pending ratings on opening, for both roles.
