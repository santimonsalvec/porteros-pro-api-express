# Quickstart: Goalkeeper Wallet and Platform Commission

**Feature**: `011-goalkeeper-wallet` | [spec](./spec.md) | [contracts](./contracts/)

## 1. Automated checks

```bash
npm test && npm run lint
npm run test:http
npm run test:architecture
```

## 2. Seed the commission (once per environment)

```js
// mongosh — Colombia at country level, 7.000 COP (spec assumption)
db.commissionSettings.insertOne({ _id: 'commission-co', scope: 'country', refId: '<id of Colombia in countries>', amount: 7000 })
```

On startup, the new repositories create their indexes:
- `commissionSettings.scope_refId`;
- `walletMovements.causeKey_unique` and `walletMovements.wallet_sequence_unique`.

## 3. Manual walk-through (dev)

1. With an **admin** token: `POST /api/admin/goalkeepers/<goalkeeperUserId>/wallet/adjustments { amount: 50000, reason: "Saldo inicial de pruebas", operationKey: <uuid> }` → `201`. Repeat with the same `operationKey` → `200`, same movement.
2. `POST …/adjustments { amount: -60000, … }` with a new key → `409 insufficient_funds`.
3. As the goalkeeper: `GET /api/goalkeepers/me/wallet` → `balance: 50000`, `offers.canSeeOffers: true`, `lowestCommission: 7000`.
4. `GET /api/goalkeepers/me/wallet/movements` → 1 item, `type: admin_adjustment`, `balanceAfter: 50000`.
5. With a client-only token (no goalkeeper profile) → `404 goalkeeper_not_found`. With a non-admin token on `/api/admin/...` → `403`.

## 4. Manual concurrency check (SC-001, SC-002)

Fire 100 parallel adjustments of +1 with distinct `operationKey`s, and 20 with the same key:
- `wallets.balance` equals the sum of the movements;
- the `sequence` values are 1…N with no gaps;
- the repeated key produced exactly 1 movement.
