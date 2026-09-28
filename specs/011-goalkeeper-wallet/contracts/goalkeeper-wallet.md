# Contract: goalkeeper wallet (goalkeeper-facing)

**Auth**: `Authorization: Bearer <access token>`, the existing goalkeeper router chain. The caller must be an **active goalkeeper** (a `GoalkeeperProfile` exists). Otherwise → `404 goalkeeper_not_found`. The goalkeeper is always the token's subject.

## `GET /api/goalkeepers/me/wallet`

`200 OK`

| Field | Type | Meaning |
|---|---|---|
| `balance` | integer | Current balance in whole currency units; may be negative after penalties |
| `currency` | string | ISO 4217 |
| `offers.canSeeOffers` | boolean | Funds rule (a): false → the goalkeeper sees no matches and gets no offers |
| `offers.lowestCommission` | integer \| null | The lowest configured commission among the goalkeeper's enabled zones; null when none is configured |
| `offers.missingAmount` | integer | `max(0, lowestCommission − balance)`; 0 when `canSeeOffers` is true |
| `movementCount` | integer | Total number of movements |

```json
{ "balance": 13000, "currency": "COP", "offers": { "canSeeOffers": true, "lowestCommission": 7000, "missingAmount": 0 }, "movementCount": 2 }
```

A goalkeeper who has never had a movement → `balance: 0`, `movementCount: 0`.

| Status | `error` | When |
|---|---|---|
| 404 | `goalkeeper_not_found` | Not an active goalkeeper |
| 422 | `wallet_not_configured` | The currency of the profile's country can't be resolved |
| 401 | — | No or invalid token |

## `GET /api/goalkeepers/me/wallet/movements?page=&pageSize=`

Pagination identical to the 009 list: `page` ≥ 1 (default 1) and `pageSize` 1–50 (default 20). Invalid values → `400 validation_failed` with `fieldErrors`.

`200 OK`: `{ items, page, pageSize, totalItems, totalPages }`, newest first (by sequence).

| Item field | Type | Meaning |
|---|---|---|
| `movementId` | string | |
| `sequence` | integer | 1 = the first movement of the wallet |
| `type` | string | `top_up` \| `commission_charge` \| `commission_refund` \| `penalty` \| `penalty_reversal` \| `admin_adjustment` |
| `amount` | integer | Signed (credits > 0, debits < 0) |
| `currency` | string | |
| `balanceAfter` | integer | |
| `occurredAt` | string | UTC |
| `references` | object | `bookingId`, `requestId`, `topUpId`, `caseId`, `penaltyMovementId` when present |
| `cancellation` | object \| null | `{ by, at, reason }` on refunds |
| `reason` | string \| null | On administrative adjustments |

The invoicing snapshot and the admin's identity are **not** returned to the goalkeeper.
