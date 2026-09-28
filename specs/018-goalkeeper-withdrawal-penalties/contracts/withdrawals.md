# Contract: Withdrawals, Penalties and Reversals

**Feature**: `018-goalkeeper-withdrawal-penalties` | **Research**: [../research.md](../research.md)

All bodies are JSON. Errors use the existing `ErrorResponse` (`{ code, message, details? }`). Dates are ISO 8601 UTC.

## 1. Withdraw

`POST /api/goalkeepers/me/bookings/{bookingId}/withdraw`: goalkeeper token.

**Request**: `{ "reason"?: string }`, trimmed, ≤ 200 characters. Empty means none.

**200**: the booking as the agenda shows it (012's `toAgendaItem`), plus the withdrawal:

```json
{
  "bookingId": "…", "requestId": "…", "status": "goalkeeper_withdrew", "startsAt": "…", "…": "agenda fields",
  "withdrawal": {
    "withdrawalId": "…",
    "occurredAt": "2026-09-21T18:30:00.000Z",
    "noticeMinutes": 90,
    "late": true,
    "replacementCreated": true,
    "penalties": [{ "penaltyId": "…", "kind": "late", "days": 3, "startsAt": "…", "endsAt": "2026-09-24T18:30:00.000Z", "reversal": null }],
    "suspendedUntil": "2026-09-24T18:30:00.000Z"
  }
}
```

A repeat answers the same `200`, with no new effect.

| Error | When |
|---|---|
| `400 validation_failed` | The reason is too long |
| `404 goalkeeper_not_found` | The caller has no goalkeeper profile |
| `404 booking_not_found` | No such booking, or the caller never held it |
| `409 booking_not_withdrawable` + `{ status }` | It isn't assigned (cancelled, expired, pending…) |
| `409 match_started` + `{ startsAt }` | `now ≥ startsAt` |

**Side effects** (on `withdrawn` only):
- the commission is not refunded;
- a replacement booking is created if `now < searchEndsAt`;
- events `goalkeeper.withdrew` and (if a replacement was created) `booking.created`;
- notices to the client, and to the goalkeeper when suspended;
- offers of the replacement to eligible goalkeepers, excluding the one who withdrew.

## 2. Own history

`GET /api/goalkeepers/me/withdrawals?page=1&pageSize=20`: goalkeeper token. Page ≥ 1, pageSize 1–50 (default 20).

**200**:

```json
{
  "items": [{
    "withdrawalId": "…", "bookingId": "…", "requestId": "…",
    "startsAt": "…", "occurredAt": "…", "noticeMinutes": 90, "late": true, "reason": "Me enfermé",
    "replacementCreated": true,
    "penalties": [{ "penaltyId": "…", "kind": "late", "days": 3, "startsAt": "…", "endsAt": "…",
                    "reversal": { "at": "…", "reason": "Incapacidad médica" } }],
    "moneyReversal": { "at": "…", "reason": "Incapacidad médica", "amount": 7000, "currency": "COP" },
    "forgiven": true
  }],
  "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1,
  "suspendedUntil": null
}
```

The goalkeeper's view omits the administrator's id (`reversal.by`, `moneyReversal.by`). `404 goalkeeper_not_found` if the caller has no goalkeeper profile.

## 3. Admin history

`GET /api/admin/goalkeepers/{userId}/withdrawals?page&pageSize`: admin token.

Same body as §2, and each reversal also has `by` (the admin's user id). `404 goalkeeper_not_found`, `401`/`403` as the other admin routes.

## 4. Admin reversal

`POST /api/admin/goalkeepers/{userId}/withdrawals/{withdrawalId}/reversal`: admin token.

**Request**:

```json
{ "refund": true, "liftSuspension": true, "reason": "Incapacidad médica presentada" }
```

- `reason` is required: trimmed, 3–500 characters.
- `refund` and `liftSuspension` are booleans, default `false`, and at least one must be `true`.

**200**: `{ "withdrawal": <item as in §3>, "suspendedUntil": "…" | null }`.

The answer is the same when nothing was left to reverse (idempotent: no second refund, no change).

| Error | When |
|---|---|
| `400 validation_failed` | Missing or invalid reason, or neither action requested |
| `404 goalkeeper_not_found` | |
| `404 withdrawal_not_found` | Unknown, or another goalkeeper's |
| `422 wallet_not_configured` | A refund is asked but the goalkeeper's wallet context can't be resolved |
| `409 missing_charge` + `{ bookingId }` | The booking has no commission charge (data problem); nothing changed |

**Side effects**:
- **refund**: one `commission_refund` (actor admin, cancellation `{ by: 'admin', reason }`), and the balance goes up by the booking's commission;
- **liftSuspension**: every unreversed penalty is reversed, and `suspendedUntil` is recomputed immediately;
- **either**: the withdrawal stops counting toward the weekly limit.

## 5. Changed answers elsewhere

- **Goalkeeper agenda** `GET /api/goalkeepers/me/bookings`: withdrawn bookings stay listed with `status: "goalkeeper_withdrew"`.
- **Available matches, offers and accept**:
  - a suspended goalkeeper is refused as before (`unavailableReason: "suspended"`, `403 goalkeeper_suspended`);
  - a replacement never reaches the goalkeeper excluded from it, and accepting it gives `404 booking_not_available`.
- **Client requests** `GET /api/goalkeeper-requests/bookings`: the request lists the withdrawn booking (`goalkeeper_withdrew`) and its replacement (`pending_assignment`).
- **Inbox** `GET /api/notifications`: new types `booking.goalkeeper_withdrew` (client) and `goalkeeper.suspended` (goalkeeper), whose `data` has `requestId` and `bookingId`. A renewed offer shows again as unread at the top.
