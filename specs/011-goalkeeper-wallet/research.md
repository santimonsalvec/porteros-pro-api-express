# Research: Goalkeeper Wallet and Platform Commission

**Feature**: `011-goalkeeper-wallet` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

No open unknowns in the stack. The decisions below turn the spec's money guarantees into this codebase's patterns.

---

## §1 Storage: a wallet document plus an append-only movements collection

**Decision**:
- `wallets` holds one document per goalkeeper: `_id` = the goalkeeper's user id, `currency`, `balance`, `lastSequence`, `createdAt`, `updatedAt`.
- `walletMovements` holds one immutable document per movement, carrying `sequence` (1, 2, 3… per wallet) and `balanceAfter`.
- The stored `balance` is a **materialized** value, always written in the same transaction as the movement that changes it. So it always equals the sum of the movements (FR-002).

**Rationale**:
- Reading a balance is one point read (SC-005).
- The per-wallet `sequence` gives the single consistent order FR-007 asks for, plus a deterministic "newest first" sort for the history.
- Nothing ever updates or deletes a movement: the repository exposes no such method.

**Alternatives considered**:
- *Balance computed by summing the movements on every read*: correct, but it grows with the history and still needs a serialization point to validate "cannot go below 0" under concurrency.
- *Movements embedded in the wallet document*: unbounded array growth and one hot document for the history.

## §2 Atomic, ordered, concurrent-safe append

**Decision**: One MongoDB transaction per movement (`withTransaction`, like 008/010):
1. `updateOne({ _id: goalkeeperId }, { $setOnInsert: { currency, balance: 0, lastSequence: 0, createdAt } }, { upsert: true })`. The wallet is created lazily (spec assumption).
2. `findOneAndUpdate` with `{ _id, currency }` plus, **for any debit that is not a penalty**, `balance: { $gte: -amount }`, with `$inc: { balance: amount, lastSequence: 1 }` and `returnDocument: 'after'`:
   - no document returned → `insufficient_funds` (FR-008 / FR-013);
   - otherwise `balanceAfter` and `sequence` come from the returned document.
3. `insertOne` the movement, with `sequence` and `balanceAfter`.

Two concurrent appends on the same wallet conflict on the wallet document. The driver retries the loser (`TransientTransactionError`), which then reads the new balance. This way no movement is lost and each `balanceAfter` follows one order (SC-001).

**Rationale**: The condition and the increment run in one server-side operation, so there is no read-then-write race. The same mechanism is proven in 008.

## §3 Idempotency by cause key

**Decision**: every movement has a unique `causeKey` (unique index):

| Type | Cause key |
|---|---|
| `commission_charge` | `commission:<bookingId>` |
| `commission_refund` | `commission_refund:<bookingId>` |
| `penalty` | `penalty:<penaltyEventId>` |
| `penalty_reversal` | `penalty_reversal:<penaltyMovementId>` |
| `top_up` | `top_up:<topUpId>` |
| `admin_adjustment` | `adjustment:<operationKey>` |

Before the transaction, a lookup by `causeKey` returns an existing movement right away (the fast path). Inside the transaction, a duplicate-key error on `causeKey` aborts the whole transaction (so the balance is untouched); the code then reads and returns the existing movement (FR-006, SC-002).

**Rationale**: It is the same pattern as `quoteId` uniqueness in 008. It makes every future caller (acceptance, cancellation, withdrawal, gateway webhook, admin double click) safe to retry.

## §4 Commission configuration

**Decision**: a new externally seeded collection, `commissionSettings`, with documents `{ _id, scope: 'country' | 'city' | 'zone', refId, amount }`. The amount is an integer > 0, in the country's currency, and there is a unique index on `{ scope, refId }`. Domain entity `CommissionSetting`, validated like `RentalRate`. Resolution for a zone:
1. the setting with `scope: 'zone'` and `refId = zoneId`;
2. else `scope: 'city'` and `refId = zone.cityId` (always an anchor city);
3. else `scope: 'country'` and `refId` = the zone city's country (city → region → country).

The result is `number | null`. A batch resolver handles many zones at once, with one `$in` read per scope, so the wallet read resolves all of a goalkeeper's zones with at most 3 reads plus the lookups.

**Rationale**:
- Rates use zone/city scopes and booking settings use country/city. The commission needs all three levels, so it gets its own small collection rather than stretching either.
- It is read-only here and seeded by operations, like the others.

**Alternatives considered**: A field on `rentalRates`: rates are per duration, but the commission is not.

## §5 Funds rules as pure domain policy

**Decision**: `src/domain/wallet/fundsPolicy.ts`:
- `offersStatus(balance, zoneCommissions: (number | null)[])` → `{ canSeeOffers, lowestCommission: number | null, missingAmount }`:
  - unconfigured zones (`null`) are ignored;
  - with no configured zone at all → `canSeeOffers: false`, `lowestCommission: null`;
  - `missingAmount = max(0, lowestCommission − balance)`.
- `canAfford(balance, commission: number | null)` → `commission !== null && balance >= commission`. A negative balance never qualifies (commissions are > 0).

**Rationale**: FR-012 asks for one reusable decision. It is pure, so 012 (available matches and acceptance) and 015 (notifications) call the same function, and it is exhaustively unit-tested (SC-004).

## §6 Wallet currency

**Decision**: the wallet currency comes from the goalkeeper profile's `cityId` → city → region → country → `currency`, the same path `resolveAreaSettings` uses. It is fixed at wallet creation. If the country or currency can't be resolved, it is a configuration error: `wallet_not_configured` (422), logged, and nothing is recorded.

## §7 Invoicing snapshot

**Decision**: every movement stores `invoicing: { documentType, documentNumber }`, copied from the goalkeeper profile when the movement is recorded (FR-005). It is a snapshot, not a reference, so later profile edits don't rewrite history.

## §8 Access control

**Decision**:
- **Goalkeeper routes**: `GET /api/goalkeepers/me/wallet` and `GET /api/goalkeepers/me/wallet/movements`, on the existing goalkeeper router chain. An active goalkeeper is defined by the database, as in 006: a `GoalkeeperProfile` exists. Without one → `404 goalkeeper_not_found`, reusing the existing code (FR-015).
- **Admin routes**, on a new `/api/admin` router with `requireAuth` + a new `requireAdmin` middleware (`claims.isAdmin === 'true'`, else `403` with no body, mirroring `requireClientOnly`):
  - `GET /api/admin/goalkeepers/:userId/wallet`;
  - `GET /api/admin/goalkeepers/:userId/wallet/movements`;
  - `POST /api/admin/goalkeepers/:userId/wallet/adjustments`.

  A user who is not an active goalkeeper → `404 goalkeeper_not_found` (FR-018).

## §9 Movement history pagination

**Decision**: the same page / pageSize / totals contract and zod schema style as 009 (default 20, maximum 50). Sort `{ sequence: -1 }` over index `{ walletId: 1, sequence: -1 }`. `totalItems` comes from the wallet's `lastSequence`, with no count query (each movement increments it exactly once).

## §10 Internal operations for later features

**Decision**: an application service, `WalletLedger` (`src/application/features/wallet/common/walletLedger.ts`), is the only way to record movements. It has one method per movement type:
- `chargeCommission({ goalkeeperId, bookingId, requestId, amount, currency })`;
- `refundCommission({ …, cancellation: { by, at, reason } })`, which refunds the **charged** amount, read from the charge movement (FR-011); no charge → `nothing_to_refund`;
- `applyPenalty`;
- `reversePenalty`;
- `creditTopUp`;
- `adjust`.

Each method builds a movement draft (type, sign, cause key, references, actor, invoicing snapshot) and calls the port `IWalletStore.append(draft)`, which performs §2 and §3.

The infrastructure also exports `appendMovementInSession(session, draft)`, so a later store (012's acceptance transaction) can charge the commission **inside its own transaction**.

Only `adjust` is reachable by an endpoint in this feature (FR-019). The rest are unit-tested and wait for their callers.

## §11 Warning for unconfigured commissions

**Decision**: the wallet read returns `unconfiguredZoneIds`. The controller logs `logger.warn({ outcome: 'commission_not_configured', zoneIds })` when the list is not empty, the same pattern as 007/010's configuration warnings (FR-010). The field is not serialized.

## §12 Testing

**Decision**: same tiers as before:
- `fundsPolicy`: the full table of SC-004;
- `WalletMovement` / `Wallet` domain;
- `WalletLedger`: signs, cause keys, refund amount, invoicing snapshot;
- the handlers, against a `FakeWalletStore` that applies §2 and §3 in memory, including "insufficient funds" and "duplicate cause";
- the Mongo store, against the mocked collection plus `withTransaction`: filters, `$gte` guard, upsert, duplicate classification;
- `CommissionSettingRepository` and the commission resolver;
- HTTP tests for both routers (`await buildTestApp()`).

Real concurrency (SC-001) gets a manual check, as in 008 and 010.
