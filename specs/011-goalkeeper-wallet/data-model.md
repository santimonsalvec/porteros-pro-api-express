# Data Model: Goalkeeper Wallet and Platform Commission

**Feature**: `011-goalkeeper-wallet` | **Date**: 2026-09-27 | **Research**: [research.md](./research.md)

## `Wallet` — new collection `wallets`

| Field | Type | Notes |
|---|---|---|
| `_id` | string | The goalkeeper's user id (one wallet per goalkeeper) |
| `currency` | string | ISO 4217, from the profile city's country; fixed at creation |
| `balance` | integer | Always = the sum of the movements (written in the same transaction) |
| `lastSequence` | integer ≥ 0 | Sequence of the latest movement; also the movement count |
| `createdAt`, `updatedAt` | Date | |

Created lazily by the first movement (upsert). A missing wallet reads as balance 0, with no movements.

## `WalletMovement` — new collection `walletMovements` (append-only)

| Field | Type | Notes |
|---|---|---|
| `_id` | string | UUIDv7 |
| `walletId` | string | = goalkeeper user id |
| `sequence` | integer ≥ 1 | Consecutive per wallet: the single order of FR-007 |
| `type` | `MovementType` | See below |
| `amount` | integer ≠ 0 | Signed: credits > 0, debits < 0 |
| `currency` | string | = the wallet's currency |
| `balanceAfter` | integer | The balance right after this movement |
| `occurredAt` | Date | |
| `causeKey` | string | Unique (research §3) |
| `actor` | `{ kind: 'system' \| 'goalkeeper' \| 'admin'; userId: string \| null }` | Who caused it |
| `references` | `{ bookingId?, requestId?, topUpId?, caseId?, penaltyMovementId? }` | |
| `cancellation` | `{ by: 'client' \| 'system' \| 'admin'; at: Date; reason: string } \| null` | Only on `commission_refund` |
| `reason` | `string \| null` | Required on `admin_adjustment` |
| `invoicing` | `{ documentType: string; documentNumber: string }` | Snapshot from the goalkeeper profile (FR-005) |

**Indexes** (`WalletMovementRepository.ensureIndexes()`):

| Name | Definition | Serves |
|---|---|---|
| `causeKey_unique` | `{ causeKey: 1 }`, unique | Idempotency (FR-006) |
| `wallet_sequence_unique` | `{ walletId: 1, sequence: -1 }`, unique | History newest first; guards the order |

### `MovementType` and signs

| Type | Sign | Cause key | Allowed to go below 0 |
|---|---|---|---|
| `top_up` | + | `top_up:<topUpId>` | — |
| `commission_charge` | − | `commission:<bookingId>` | no → `insufficient_funds` |
| `commission_refund` | + | `commission_refund:<bookingId>` | — |
| `penalty` | − | `penalty:<penaltyEventId>` | **yes** |
| `penalty_reversal` | + | `penalty_reversal:<penaltyMovementId>` | — |
| `admin_adjustment` | ± | `adjustment:<operationKey>` | no → `insufficient_funds` |

## `CommissionSetting` — new collection `commissionSettings` (externally seeded, read-only)

| Field | Type | Notes |
|---|---|---|
| `_id` | string | |
| `scope` | `'country' \| 'city' \| 'zone'` | `city` = an anchor city |
| `refId` | string | A country, anchor city or zone id |
| `amount` | integer > 0 | In the country's currency |

Unique index `{ scope: 1, refId: 1 }`. Resolution: zone → the zone's anchor city → the country (research §4). Initial seed: `{ scope: 'country', refId: <Colombia id>, amount: 7000 }`.

## Domain (`src/domain/wallet/`)

```ts
type MovementType = 'top_up' | 'commission_charge' | 'commission_refund' | 'penalty' | 'penalty_reversal' | 'admin_adjustment';
class WalletMovement extends Entity<string> { /* fields above; constructor validates sign per type, non-zero integer, reason on admin_adjustment, cancellation only on refunds */ }
class Wallet { goalkeeperId; currency; balance; lastSequence; createdAt; updatedAt; static empty(goalkeeperId, currency, now) }
class CommissionSetting extends Entity<string> { scope; refId; amount }   // validated like RentalRate

// fundsPolicy.ts
function offersStatus(balance: number, zoneCommissions: (number | null)[]):
  { canSeeOffers: boolean; lowestCommission: number | null; missingAmount: number };
function canAfford(balance: number, commission: number | null): boolean;
```

## Application (`src/application/features/wallet/`)

```ts
// common/ports.ts
interface MovementDraft { goalkeeperId; currency; type; amount; causeKey; actor; references; cancellation; reason; invoicing; occurredAt }
type AppendResult =
  | { kind: 'recorded'; movement: WalletMovement; wallet: Wallet }
  | { kind: 'duplicate'; movement: WalletMovement }          // same causeKey already recorded
  | { kind: 'insufficient_funds'; balance: number };
interface IWalletStore { append(draft: MovementDraft): Promise<AppendResult>; }
interface IWalletRepository { findByGoalkeeperId(id: string): Promise<Wallet | null>; }
interface IWalletMovementRepository {
  findByCauseKey(causeKey: string): Promise<WalletMovement | null>;
  listForWallet(walletId: string, skip: number, limit: number): Promise<WalletMovement[]>;   // sequence desc
}
interface ICommissionResolver { resolveForZones(zoneIds: string[]): Promise<Map<string, number | null>>; }

// common/walletLedger.ts — the only writer (research §10)
class WalletLedger { chargeCommission, refundCommission, applyPenalty, reversePenalty, creditTopUp, adjust }

// queries: GetGoalkeeperWalletQuery(goalkeeperId) → wallet view | not_a_goalkeeper | wallet_not_configured
//          ListWalletMovementsQuery(goalkeeperId, page, pageSize) → page | not_a_goalkeeper
// commands: RecordWalletAdjustmentCommand(adminUserId, goalkeeperId, amount, reason, operationKey)
//          → recorded | replayed | insufficient_funds | not_a_goalkeeper | wallet_not_configured
```

## Validation rules traced to requirements

| Rule | Where | Requirement |
|---|---|---|
| Balance only through movements; sum invariant | store transaction (`$inc` + insert) | FR-002 |
| Sign per type; non-zero integer; reason on adjustments | `WalletMovement` constructor | FR-003, FR-017 |
| References, actor, cancellation, invoicing snapshot | `WalletLedger` drafts | FR-004, FR-005 |
| One movement per cause | `causeKey_unique` + fast-path lookup | FR-006 |
| Single order under concurrency | wallet `lastSequence` `$inc` in the transaction | FR-007 |
| Only penalties may go negative | `$gte` guard for other debits | FR-008, FR-013 |
| Zone → city → country commission; null when missing | `CommissionResolver` | FR-009, FR-010 |
| Refund = the charged amount | `WalletLedger.refundCommission` reads the charge | FR-011 |
| Offers / affordability | `fundsPolicy` | FR-012 |
| Goalkeeper-only, own data | goalkeeper router + `claims.sub` + profile check | FR-014, FR-015 |
| Admin-only reads and adjustments | `requireAdmin` | FR-016–FR-018 |
