# Contract change: `POST /api/goalkeeper-requests/quote`

Base contract: [`specs/007-goalkeeper-service-quote/contracts/quote-service.md`](../../007-goalkeeper-service-quote/contracts/quote-service.md). Everything there stays as is **except** what is listed here.

## What changes

1. **The endpoint is no longer read-only.** Every successful quote is stored for 3 minutes so it can be confirmed with `POST /bookings`. This supersedes 007's "creates, reserves and changes nothing". Refused quotes are still never stored.
2. **Two response fields are added** to the `200 OK` body. Every existing field keeps its name, type and meaning (FR-003):

| Field | Type | Meaning |
|---|---|---|
| `quoteId` | string | Opaque identifier (UUID) to send to `POST /api/goalkeeper-requests/bookings` |
| `expiresAt` | string | UTC instant (`…Z`) until which the quote can be confirmed: 3 minutes after issuance. Confirmation is accepted strictly before it |

```json
{
  "unitRate": 55000,
  "goalkeeperCount": 2,
  "subtotal": 110000,
  "unitSurcharge": 5000,
  "surcharge": 10000,
  "total": 120000,
  "currency": "COP",
  "startsAt": "2026-09-21T20:00:00.000Z",
  "startsAtLocal": "2026-09-21T15:00:00-05:00",
  "timeZone": "America/Bogota",
  "quoteId": "01924f6e-8c1b-7c3a-9d4e-2b7f5a1c9e00",
  "expiresAt": "2026-09-21T18:33:00.000Z"
}
```

3. **A new failure mode**: if the quote can't be stored, the call fails with `500 internal_error` and no price is returned (FR-005). A client is never shown a price it can't confirm.

## What does not change

Request body, validation, every refusal code, the extra fields on refusals, the evaluation order, the amounts and the auth chain (FR-004). `GET /api/goalkeeper-requests/config` is unaffected and stores nothing (FR-006).

## Client guidance

- Show a countdown from `expiresAt`, computed against the server time (the response's `Date` header), not the device clock.
- Asking for a new quote is always allowed and doesn't invalidate earlier ones. Each expires on its own.
