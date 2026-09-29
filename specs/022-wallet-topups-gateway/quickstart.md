# Quickstart: Wallet Top-ups through Payment Gateways

**Feature**: `022-wallet-topups-gateway` | **Contract**: [contracts/top-ups.md](./contracts/top-ups.md)

## 0. Setup

1. **Secrets (sandbox)**: `WOMPI_CO_PRIVATE_KEY=prv_test_…`, `WOMPI_CO_EVENTS_SECRET=test_events_…`, `WOMPI_CO_INTEGRITY_SECRET=test_integrity_…`. In the cloud, `apphosting.yaml` maps them from Secret Manager.
2. **Payments configuration**: `PAYMENTS_PUBLIC_BASE_URL` (the API's public HTTPS base, for the `redirect-url`) and `PAYMENTS_APP_OPEN_URL` (the button's link).
3. **Link association** (optional): `ANDROID_APP_PACKAGE`, `ANDROID_CERT_SHA256` and `IOS_APP_ID`.
4. **The country's gateway**: an administrator sets Colombia with `PUT /api/admin/payment-gateways/{countryCoId}`: the sandbox public key, the costs and the five amounts.
5. **The Wompi dashboard**: point its events URL to `{PAYMENTS_PUBLIC_BASE_URL}/webhooks/payments/wompi`.

## 1. Top up (sandbox)

1. `GET /api/goalkeepers/me/wallet/top-up-options` shows 5 options with cost and net.
2. `POST /api/profile/terms/accept` if `termsAccepted` is false.
3. `POST …/top-ups {"amount":20000}` returns `checkoutUrl`. Open it and pay with a Wompi sandbox approved test card.

**Expected**:
- Wompi redirects to `/pagos/retorno/PPR-…?id=…`: "Recarga aprobada" (or "pendiente" until the event arrives);
- the event credits the wallet: `top_up +20000` and `gateway_fee −cost`;
- the push "Recarga aprobada…".

## 2. Declined

Use a sandbox declined card.

**Expected**: `declined`, no movement, the push "Tu recarga … no se completó".

## 3. Lost event

Block the webhook (or run locally without a tunnel) and pay, then run `POST /internal/sweep` after 15 minutes (or move the clock).

**Expected**: the reconciliation finds `APPROVED` and credits it once.

## 4. Manual checks (add to `_temp_pruebas.md` §16, deferred to the end of the roadmap)

- §1–§3 in sandbox, then once in production with a small real payment.
- Nequi and PSE flows return to the app through the app link.
- Switching Colombia's gateway doesn't affect a pending top-up.
