# Data Model: Wallet Top-ups through Payment Gateways

**Feature**: `022-wallet-topups-gateway` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## `topUps` (new)

| Field | Type | Notes |
|---|---|---|
| `_id` | uuid v7 | |
| `goalkeeperId`, `countryId` | string | |
| `gateway` | `'wompi'` | Fixed at start (FR, US5) |
| `environment` | `'sandbox' \| 'production'` | Fixed at start: reconciliation queries the same environment |
| `reference` | string | `PPR-…`, unique |
| `gatewayTransactionId` | string \| null | Once known |
| `amount`, `cost`, `net` | integer | Whole currency units |
| `currency` | string | `COP` |
| `status` | `'pending' \| 'approved' \| 'declined' \| 'voided' \| 'error' \| 'expired'` | |
| `createdAt`, `finalizedAt`, `lastCheckedAt`, `nextCheckAt` | Date \| null | |
| `checks` | integer | Reconciliation attempts |

Indexes:
- `reference_unique`: `{ reference: 1 }`, unique;
- `goalkeeper_created`: `{ goalkeeperId: 1, createdAt: -1, _id: -1 }`;
- `status_nextCheck`: `{ status: 1, nextCheckAt: 1 }`.

```text
pending ──approved──▶ approved (credited)
pending ──declined/voided/error──▶ final, no credit
pending ──48 h without a final answer──▶ expired
expired ──approved (late)──▶ approved (credited)
```

## `paymentGatewaySettings` (new)

One document per country.

| Field | Type | Notes |
|---|---|---|
| `_id` | countryId | |
| `gateway` | `'wompi'` | Supported gateways only |
| `publicConfig` | `{ publicKey: string; environment: 'sandbox' \| 'production' }` | No secrets |
| `currency` | string | The country's currency |
| `costs` | `{ percentBps: 0–10 000; fixed: ≥ 0; vatBps: 0–10 000 }` | |
| `amounts` | integer[] | 1–10 distinct values > 0, sorted |
| `updatedAt`, `updatedBy` | Date, adminId | |

## `walletMovements` (changed)

- **New type `gateway_fee`**: a debit of the cost.
  - Cause key `gateway_fee:{topUpId}`; references `{ topUpId }`.
  - Exempt from the guarded-debit rule (research §5).
- **`top_up`**: already exists (011, cause key `top_up:{topUpId}`).

## `termsAcceptances`

No shape change. New read `findLatestForUser(userId)`.

## `notifications`

New types, to the goalkeeper:
- `wallet.top_up_approved` (dedupe key `top-up:{id}:approved`);
- `wallet.top_up_failed` (dedupe key `top-up:{id}:failed`).

## Ports

| Port | Purpose |
|---|---|
| `IPaymentGateway` | `buildCheckout(args)`, `parseAndVerifyEvent(body, headers, secretsFor)`, `findByReference(reference, config, secrets)` |
| `IPaymentGatewayRegistry` | `get(name): IPaymentGateway \| null` |
| `IPaymentSecrets` | `forGateway(gateway, countryCode): GatewaySecrets \| null` |
| `IPaymentGatewaySettingsRepository` | `getByCountry(countryId)`, `save(settings)` |
| `ITopUpRepository` | `listForGoalkeeper`, `countForGoalkeeper`, `getById`, `getByReference`, `create`, `findDueForCheck`, `scheduleNextCheck`, `expire` |
| `ITopUpStore` | `applyOutcome(args)`: the credit transaction |
