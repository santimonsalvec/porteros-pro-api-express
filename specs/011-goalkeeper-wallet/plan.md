# Implementation Plan: Goalkeeper Wallet and Platform Commission

**Branch**: `011-goalkeeper-wallet` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-goalkeeper-wallet/spec.md`

## Summary

Each active goalkeeper gets a **wallet**, stored in `wallets` with a materialized balance, per-wallet sequence and currency. Its **append-only movements** go in `walletMovements`. Every movement is recorded in **one MongoDB transaction**, in three steps:
1. lazily upsert the wallet;
2. run a conditional `$inc` of the balance and the sequence. The condition `balance ≥ −amount` applies to every debit except penalties;
3. insert the movement with its `sequence` and `balanceAfter`.

A unique `causeKey` makes every cause (a booking's commission, a refund, a penalty, a top-up, an admin operation key) record **at most one movement**.

The **commission** is a fixed amount in a new seeded collection, `commissionSettings`, resolved zone → anchor city → country. The **funds rules** (can the goalkeeper see offers at all; can they afford this match) are a pure domain policy. A `WalletLedger` application service is the single writer: it builds the typed movements the later features need.

In this feature, two groups of endpoints are exposed:
- **Goalkeeper**: `GET /api/goalkeepers/me/wallet` and `…/movements`.
- **Admin**, on a new `/api/admin` router with a new `requireAdmin` middleware: read any goalkeeper's wallet and movements, and record adjustments with a mandatory reason and an idempotent `operationKey`.

Decisions and alternatives: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`). No new dependency.
**Storage**: MongoDB (Atlas replica set, transactions available). Three new collections:
- `wallets`;
- `walletMovements` (append-only);
- `commissionSettings` (externally seeded, read-only).

See [data-model.md](./data-model.md).
**Testing**: Vitest, the same tiers as 008–010:
- the domain policy (full table);
- ledger and handlers against fakes;
- the store against the mocked collection plus `withTransaction`;
- HTTP tests with `await buildTestApp()`.

The real-concurrency check is manual ([quickstart.md](./quickstart.md) §4).
**Target Platform**: Firebase App Hosting (Cloud Run). Unchanged.
**Project Type**: Single backend web service.
**Performance Goals**: SC-005 — the wallet in under 1 s at p95 for wallets with up to 1.000 movements. Reading it costs one wallet point read, the profile, and one commission resolution (≤ 3 reads for zone, city and country, plus the city → region → country lookup). The history is one indexed `find` with skip/limit; its total comes from `lastSequence`.
**Constraints**:
- the balance always equals the sum of the movements;
- no lost updates;
- each cause yields at most one movement;
- only penalties may go negative.

**Scale/Scope**: One wallet per goalkeeper; tens to hundreds of movements a month each.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template. As in 007–010, the plan follows the established discipline:
- **Layering**: persistence behind ports (`IWalletStore`, `IWalletRepository`, `IWalletMovementRepository`, `ICommissionResolver`), with no MongoDB types in the domain or application layers.
- **Rules in the domain**: `fundsPolicy`, and `WalletMovement` sign/field validation.
- **CQRS**: reads are queries; the adjustment is a command.
- **Exhaustive outcome mapping.**
- **Tests without real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes.
- New: a domain area (`wallet`), an application slice (`features/wallet`), 3 collections, 1 middleware (`requireAdmin`) and 1 router (`/api/admin`).
- Existing code changes only in `di.ts`, `app.ts`, the goalkeeper controller (2 routes), the OpenAPI spec and the test factory.

## Project Structure

### Documentation (this feature)

```text
specs/011-goalkeeper-wallet/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── goalkeeper-wallet.md   # GET /api/goalkeepers/me/wallet, /movements
│   └── admin-wallet.md        # /api/admin/goalkeepers/:userId/wallet…
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/wallet/                                   # NEW domain area
│   ├── walletMovement.ts                            # MovementType, sign rules, fields (validated)
│   ├── wallet.ts                                    # Wallet (balance, currency, lastSequence), Wallet.empty
│   ├── commissionSetting.ts                         # scope country|city|zone, refId, amount (validated)
│   └── fundsPolicy.ts                               # offersStatus(), canAfford()
│
├── application/features/wallet/                     # NEW feature slice
│   ├── common/
│   │   ├── ports.ts                                 # IWalletStore (+ MovementDraft, AppendResult), IWalletRepository,
│   │   │                                            #   IWalletMovementRepository, ICommissionResolver, ICommissionSettingRepository
│   │   ├── walletLedger.ts                          # the only writer: charge/refund/penalty/reversal/top-up/adjust drafts
│   │   ├── commissionResolver.ts                    # zone → anchor city → country, batch, null when missing
│   │   ├── goalkeeperWalletContext.ts               # profile + currency (city → region → country) + zone commissions
│   │   └── walletResponses.ts                       # wallet view, movement item (goalkeeper / admin variants)
│   ├── queries/getGoalkeeperWallet/                 # (goalkeeperId) → view | not_a_goalkeeper | wallet_not_configured
│   ├── queries/listWalletMovements/                 # (goalkeeperId, page, pageSize, audience) → page | not_a_goalkeeper
│   └── commands/recordWalletAdjustment/             # (adminId, goalkeeperId, amount, reason, operationKey) → recorded | replayed | …
│
├── infrastructure/
│   ├── auth/middleware/requireAdmin.ts              # NEW: isAdmin === 'true' else 403
│   ├── persistence/mongo/
│   │   ├── walletStore.ts                           # NEW: transaction (upsert, guarded $inc, insert), causeKey duplicates;
│   │   │                                            #   exports appendMovementInSession(session, draft) for later features
│   │   ├── walletRepository.ts                      # NEW: wallets read + mapping
│   │   ├── walletMovementRepository.ts              # NEW: indexes, findByCauseKey, listForWallet
│   │   └── commissionSettingRepository.ts           # NEW: index scope_refId, findFor(zoneIds, cityIds, countryIds)
│   ├── di.ts                                        # MODIFIED: repos + ensureIndexes, handlers, admin router deps
│   └── openapi/openapiSpec.ts                       # MODIFIED: 5 endpoints
│
├── controllers/
│   ├── goalkeeperController.ts                      # MODIFIED: GET /me/wallet, /me/wallet/movements
│   ├── adminController.ts                           # NEW: /api/admin/goalkeepers/:userId/wallet…
│   └── requests/wallet/                             # NEW: movements page query schema, adjustment body schema
└── app.ts                                           # MODIFIED: mount /api/admin

tests/
├── fakes/            # fakeWalletStore, fakeWalletRepository(+movements), fakeCommissionSettingRepository (NEW)
├── unit/domain/wallet/                              # walletMovement, fundsPolicy (SC-004 table), commissionSetting
├── unit/application/features/wallet/                # walletLedger, commissionResolver, the 3 handlers
├── unit/infrastructure/persistence/mongo/           # walletStore, walletRepository, walletMovementRepository, commissionSettingRepository
├── unit/infrastructure/auth/requireAdmin.test.ts
└── http/controllers/                                # goalkeeperWallet.test.ts, adminWallet.test.ts
```

**Structure Decision**: Same single-project layering.
- The wallet is its own domain area and feature slice. The goalkeeper-request slice will depend on it, not the other way round.
- The admin endpoints get their own router, so later admin features (penalty reversal, PQRS cases) share `requireAdmin`.

## Implementation notes

- **Store transaction** (`walletStore.ts`): `withTransaction` with the snapshot/majority/primary options used in 008. Steps:
  1. `updateOne({ _id }, { $setOnInsert: { currency, balance: 0, lastSequence: 0, createdAt: now } , $set: { updatedAt: now } }, { upsert: true, session })`;
  2. `findOneAndUpdate({ _id, currency, ...(guarded ? { balance: { $gte: -amount } } : {}) }, { $inc: { balance: amount, lastSequence: 1 } }, { returnDocument: 'after', session })`. Null → return `insufficient_funds` without inserting, and the transaction commits only the upsert (harmless);
  3. `insertOne(movement with sequence = lastSequence, balanceAfter = balance, { session })`.

  Classify `11000` by `keyPattern.causeKey`: abort, re-read by `causeKey`, return `duplicate`.
- **Guarded** = every debit except `penalty` (FR-008).
- **Fast path**: `WalletLedger` first calls `findByCauseKey`; if it exists → `duplicate` without a transaction.
- **Refund amount**: `refundCommission` reads the charge movement by `commission:<bookingId>` and refunds `−charge.amount` (FR-011); no charge → `nothing_to_refund`.
- **Invoicing snapshot**: taken from `GoalkeeperProfile` (`documentType`, `documentNumber`) when the draft is built.
- **Warnings**: the controller logs `commission_not_configured` (zone ids) and `wallet_not_configured` (city id) as `warn`.
- **Seed**: the Colombia commission at 7.000 COP ([quickstart.md](./quickstart.md) §2); no code seeds data.

## Complexity Tracking

*No entries. The Constitution Check raised no violations to justify.*
