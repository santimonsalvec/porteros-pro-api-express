# Implementation Plan: Wallet Top-ups through Payment Gateways

**Branch**: `022-wallet-topups-gateway` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-wallet-topups-gateway/spec.md`

## Summary

**Goalkeeper endpoints**:
- `GET …/wallet/top-up-options` lists the country's amounts with each cost and net, plus whether the current terms are accepted;
- `POST …/wallet/top-ups` starts a top-up. It creates a pending `topUps` document with a unique `PPR-…` reference and the gateway it started with, and answers the Wompi **Web Checkout** URL, signed on the server with the integrity secret;
- a list and a read of the goalkeeper's top-ups.

**Confirmation**: Wompi's `transaction.updated` events arrive at `POST /webhooks/payments/wompi` and are verified with the events checksum. A genuine outcome goes through **one transaction** (`applyOutcome`) that credits an approval exactly once:
- a `top_up` of the gross amount;
- a new `gateway_fee` debit of the cost.

The cause keys make repeats harmless. Mismatched amounts are never credited.

**Reconciliation**: a `top-up-reconcile` sweep job asks Wompi, by reference, about top-ups pending at 15 min, 1 h, 6 h and 24 h, and expires them at 48 h. A late approval is still credited.

**Notices**: the goalkeeper gets one on approval and one on failure (clarification 2).

**Return**: `/pagos/retorno/{reference}` is a public page showing the status, also served as an App Link / Universal Link through the `.well-known` association files (clarification 1).

**Administration**: administrators set each country's gateway, public key, costs and amounts. Secrets come from **Secret Manager through App Hosting environment variables**, never the database.

Every gateway call sits behind `IPaymentGateway`, so tests never touch Wompi.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only.
- The Wompi adapter uses `node:crypto` (SHA-256) and Node's global `fetch`.
- Secrets are environment variables that App Hosting resolves from Secret Manager.

No new dependency.
**Storage**: MongoDB (Atlas, transactions).
- New collections: `topUps` (indexes `reference_unique`, `goalkeeper_created`, `status_nextCheck`) and `paymentGatewaySettings`.
- New movement type `gateway_fee`.
- New read on `termsAcceptances`.

**External**: Wompi, Web Checkout plus the events webhook plus the transactions API, in sandbox and production. Google Secret Manager, through `apphosting.yaml`.
**Testing**: As 011 and 016–021.
- **Unit**:
  - the cost math (rounding up, net ≥ 1);
  - the Wompi adapter: the integrity signature and the event checksum, against the docs' published examples, including a tampered event;
  - the start command (every refusal);
  - `applyOutcome` on mocked collections and the fake (every transition, a repeat, a mismatch, a late approval, a negative balance);
  - the webhook command;
  - the reconciliation job (schedule, expiry, gateway down);
  - the notices;
  - the settings validation.
- **HTTP**: every contract row with a fake gateway that signs like Wompi, the webhook end to end, the return page and the `.well-known` files.

**Target Platform**: Firebase App Hosting (Cloud Run).
**Project Type**: Single backend web service.
**Performance Goals**: The start answers like any write. The credit comes within 1 minute of the event (SC-002), and reconciliation within one sweep.
**Constraints**:
- no secret in the database, logs or responses;
- exactly-once credit;
- the return page never credits;
- in-flight top-ups keep their gateway.

**Scale/Scope**: A handful of top-ups per goalkeeper per week.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–021 discipline applies:
- **Layering**: the cost math, the top-up entity and the settings validation in the domain; commands, queries and the job in the application behind ports. The Wompi adapter (`node:crypto`, `fetch`), the secrets, the Mongo stores and the controllers in infrastructure.
- **CQRS and exhaustive mappings.**
- **Fakes, no real resources**: a fake gateway, and no calls to Wompi.
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. The cross-feature edits are deliberate:
- 011's movement types (`gateway_fee`, guarded-debit exemption);
- 001's terms repository (a new read) and profile routes (accept terms);
- the sweep job list;
- `app.ts` (the webhook, the return page and `.well-known`, mounted outside `/api`).

## Project Structure

### Documentation (this feature)

```text
specs/022-wallet-topups-gateway/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/top-ups.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── payments/topUp.ts                         # NEW: TopUp entity, statuses, transitions
│   ├── payments/gatewaySettings.ts               # NEW: settings (validated), costFor(amount), options()
│   ├── wallet/walletMovement.ts                  # MODIFIED: gateway_fee (+ guarded-debit exemption)
│   └── notifications/topUpMessages.ts            # NEW
├── application/features/payments/                # NEW slice
│   ├── common/ports.ts                           # gateway, registry, secrets, settings, topUps, store
│   ├── queries/getTopUpOptions/, listTopUps/, getTopUp/
│   ├── commands/startTopUp/, applyGatewayEvent/, setGatewaySettings/
│   ├── (profile slice) commands/acceptCurrentTerms/  # NEW: POST /api/profile/terms/accept
│   ├── jobs/topUpReconcileJob.ts
│   └── common/topUpNotices.ts                    # notifyOnce wrappers
├── infrastructure/
│   ├── payments/wompiGateway.ts                  # NEW: checkout URL + signature, event checksum, query by reference
│   ├── payments/envPaymentSecrets.ts             # NEW: WOMPI_{CC}_* from the environment
│   ├── payments/gatewayRegistry.ts               # NEW
│   ├── persistence/mongo/topUpRepository.ts, topUpStore.ts, paymentGatewaySettingsRepository.ts  # NEW
│   ├── persistence/mongo/termsAcceptanceRepository.ts  # MODIFIED: findLatestForUser
│   ├── config.ts                                 # MODIFIED: payments (publicBaseUrl, appOpenUrl, app link ids)
│   ├── openapi/openapiSpec.ts, di.ts             # MODIFIED
└── controllers/
    ├── goalkeeperController.ts                   # MODIFIED: top-up routes under /me/wallet
    ├── profileController.ts                      # MODIFIED: POST /terms/accept
    ├── adminController.ts                        # MODIFIED: /payment-gateways/:countryId
    ├── paymentWebhooksController.ts              # NEW: /webhooks/payments/wompi
    └── paymentReturnController.ts                # NEW: /pagos/retorno/:reference + /.well-known/*
apphosting.yaml                                   # MODIFIED: secret env references (no values)
docs/payments.md                                  # NEW: setup (Secret Manager, Wompi dashboard, app links)
```

**Structure Decision**: Payments form their own `payments` slice, next to `wallet`. The credit reuses 011's `appendMovementInSession` inside the payments store's transaction, so the ledger stays the only writer of balances.

## Complexity Tracking

*No entries.*
