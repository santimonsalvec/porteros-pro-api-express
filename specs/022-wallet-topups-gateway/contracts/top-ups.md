# Contract: Wallet Top-ups

**Feature**: `022-wallet-topups-gateway` | **Research**: [../research.md](../research.md)

## 1. Options

`GET /api/goalkeepers/me/wallet/top-up-options`: goalkeeper token.

```json
{ "available": true, "gateway": "wompi", "currency": "COP", "termsAccepted": true, "termsVersion": "1.0",
  "options": [{ "amount": 20000, "cost": 1500, "net": 18500 }] }
```

- Without a configured gateway: `available: false`, `options: []`.
- `404 goalkeeper_not_found`; `422 wallet_not_configured`.

## 2. Start a top-up

`POST /api/goalkeepers/me/wallet/top-ups` with `{ "amount": 20000 }`.

**201**:

```json
{ "topUpId": "…", "reference": "PPR-…", "status": "pending", "amount": 20000, "cost": 1500, "net": 18500, "currency": "COP",
  "checkoutUrl": "https://checkout.wompi.co/p/?public-key=…&currency=COP&amount-in-cents=2000000&reference=PPR-…&signature%3Aintegrity=…&redirect-url=…",
  "createdAt": "…" }
```

| Error | When |
|---|---|
| `400 validation_failed` / `400 invalid_amount` | Not one of the country's amounts |
| `409 terms_not_accepted` + `{ termsVersion }` | The current terms aren't accepted |
| `409 top_ups_unavailable` | No gateway configured for the country |
| `503 gateway_unavailable` | Missing secrets or gateway not supported |
| `404 goalkeeper_not_found`; `422 wallet_not_configured` | |

## 3. List and read

`GET /api/goalkeepers/me/wallet/top-ups?page&pageSize` returns `{ items, page, pageSize, totalItems, totalPages }`. Each item: `topUpId, reference, status, amount, cost, net, currency, createdAt, finalizedAt`.

`GET /api/goalkeepers/me/wallet/top-ups/{topUpId}` returns one item. Another goalkeeper's or an unknown one → `404 top_up_not_found`.

## 4. Accept the current terms

`POST /api/profile/terms/accept` (signed-in user) → `201 { termsVersion, privacyPolicyVersion, acceptedAt }`.

## 5. Webhook (Wompi)

`POST /webhooks/payments/wompi`: no platform auth. The body is Wompi's `transaction.updated` event.

- `200` always, unless there's an internal error (`500`).
- It credits only a genuine `APPROVED` event matching the top-up's amount and currency.

## 6. Return page

- `GET /pagos/retorno/{reference}` (Wompi appends `?id=`): public HTML showing the status, the amount and the net, with a "Volver a PorterosPRO" button.
- `GET /.well-known/assetlinks.json` and `GET /.well-known/apple-app-site-association`: the app link association from configuration, `404` when not configured.

## 7. Administrators

`GET /api/admin/payment-gateways/{countryId}` → `200` with the settings (no secrets), or `404 settings_not_found`.

`PUT /api/admin/payment-gateways/{countryId}`:

```json
{ "gateway": "wompi", "publicConfig": { "publicKey": "pub_test_…", "environment": "sandbox" },
  "costs": { "percentBps": 265, "fixed": 700, "vatBps": 1900 }, "amounts": [10000, 20000, 30000, 50000, 100000] }
```

- `200` with the settings.
- `400 validation_failed` for an unsupported gateway, bad amounts or bad costs.
- `404 country_not_found`.
- Non-administrators get `403`.

## 8. Notices

| `type` | When |
|---|---|
| `wallet.top_up_approved` | Credited: the net and the new balance |
| `wallet.top_up_failed` | Declined, voided, error or expired |

Both open the wallet.

## 9. Ledger

An approved top-up adds `top_up` (+ amount) and `gateway_fee` (− cost) to `GET /api/goalkeepers/me/wallet/movements`.
