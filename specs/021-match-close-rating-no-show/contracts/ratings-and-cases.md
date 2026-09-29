# Contract: Ratings and Cases

**Feature**: `021-match-close-rating-no-show` | **Research**: [../research.md](../research.md)

## 1. Pending ratings

`GET /api/ratings/pending`: any signed-in user with a complete profile.

**200**:

```json
{
  "items": [{
    "bookingId": "…", "requestId": "…", "side": "client",
    "question": "goalkeeper_arrived",
    "zoneName": "Norte", "cityName": "Cali", "startsAt": "…", "startsAtLocal": "…",
    "otherParty": { "firstName": "Juan", "lastName": "Pérez" },
    "dueUntil": "…"
  }]
}
```

- Items are ordered newest match first.
- `side` is `client` (question `goalkeeper_arrived`) or `goalkeeper` (question `payment_received`).
- It's empty when nothing is pending.

## 2. Rate

`POST /api/ratings/bookings/{bookingId}`:

```json
{ "answer": true, "stars": 5, "comment": "Muy puntual" }
```

- `answer`: boolean, required.
- `stars`: integer 1–5, required.
- `comment`: optional, trimmed, ≤ 500 characters.

**201**: `{ "ratingId", "bookingId", "side", "answer", "stars", "comment", "createdAt" }`.

| Error | When |
|---|---|
| `400 validation_failed` | Bad body |
| `404 booking_not_found` | Unknown, or the caller isn't its client or its goalkeeper |
| `409 not_rateable` + `{ reason }` | `not_finished` (the match hasn't ended and there's no check-in), `expired` (more than 7 days), `no_goalkeeper` (withdrawn, cancelled, expired booking) |
| `409 already_rated` | This side already rated this booking |

**Side effects**: see research §3. A client's "no" without a check-in suspends the goalkeeper at once and opens a case. Other "no" answers, and a late "yes", open a case.

## 3. Administrators: cases

- **`GET /api/admin/cases?status=open|resolved&page&pageSize`**: `200 { items, page, pageSize, totalItems, totalPages }`. It lists open cases first, then the newest. Each item:

  ```json
  { "caseId", "type", "status", "bookingId", "requestId", "clientId", "goalkeeperId", "createdAt", "resolution": null }
  ```

- **`GET /api/admin/cases/{caseId}`**: `200` with the item plus:
  - `rating { answer, stars, comment, createdAt, side }`;
  - `checkIn { at, photoUrl, location, distanceMeters } | null`;
  - `noShowIncidentId`.

  The location is included here: this is operations. Unknown → `404 case_not_found`.
- **`POST /api/admin/cases/{caseId}/resolve`** with `{ "note": "Se habló con ambas partes…" }` (3–500 characters):
  - `200` with the resolved case;
  - `409 case_already_resolved`;
  - `404 case_not_found`;
  - `400 validation_failed`.

Non-administrators get `403` on all three.

## 4. Changed answers

- **Booking statuses** in the client and goalkeeper views can now be `completed`.
- **018's withdrawal history items** gain `kind: "withdrawal" | "no_show"`.

## 5. Notices

| `type` | For | When |
|---|---|---|
| `goalkeeper.no_show` | goalkeeper | A no-show was recorded, with the suspension end |
