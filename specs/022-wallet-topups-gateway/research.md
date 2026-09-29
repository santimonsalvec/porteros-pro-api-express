# Research: Wallet Top-ups through Payment Gateways

**Feature**: `022-wallet-topups-gateway` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

Wompi facts were checked against its official docs on 2026-09-29:
- **Web Checkout**: https://docs.wompi.co/docs/colombia/widget-checkout-web/
- **Events**: https://docs.wompi.co/docs/colombia/eventos/
- **Environments and keys**: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/

---

## §1 Wompi Web Checkout

**Decision**: The server builds `https://checkout.wompi.co/p/?` with these parameters:
- `public-key`;
- `currency=COP`;
- `amount-in-cents` (the amount × 100);
- `reference`;
- `signature:integrity`;
- `redirect-url`.

`signature:integrity = SHA256(reference + amountInCents + currency + integritySecret)` (hex). No `expiration-time`: reconciliation handles lateness (§6), and adding it would change the signature.

When the payment ends, Wompi appends `?id=<transactionId>` to the `redirect-url`, which is why the return page takes the reference in its path (§8). The app opens the URL in the system browser (roadmap decision).

## §2 Wompi events (the confirmation)

**Decision**: `POST /webhooks/payments/wompi` (public, no platform auth) receives `transaction.updated`:

```json
{ "event": "transaction.updated",
  "data": { "transaction": { "id", "amount_in_cents", "reference", "currency", "status", "payment_method_type", … } },
  "environment": "prod|test",
  "signature": { "properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"], "checksum": "…" },
  "timestamp": 1530291411, "sent_at": "…" }
```

**Authenticity**: concatenate the values named in `signature.properties` (read from the payload by path), then `timestamp`, then the events secret. Take the SHA256 hex and compare it, case-insensitively and in constant time, with `signature.checksum`. The `X-Event-Checksum` header carries the same value.

**Processing**: the reference identifies the top-up, and so the country whose secrets verify it. Then:
- **unknown reference** → `200` and a warning;
- **bad checksum** → `200`, no change and a warning. A `4xx` would only make Wompi retry an invalid message.
- **valid** → apply the status (§5).

It always answers `200` (the body is ignored), except on an internal error: then `500`, so Wompi retries at 30 min, 3 h and 24 h.

**Statuses**: `APPROVED`, `DECLINED`, `VOIDED`, `ERROR` are final; `PENDING` changes nothing.

## §3 Querying a transaction from the backend (reconciliation)

**Decision**: `GET {base}/v1/transactions?reference={reference}` with `Authorization: Bearer {privateKey}`, where `{base}` is `https://sandbox.wompi.co` or `https://production.wompi.co`. It takes the newest transaction for the reference; none → still pending.

This call uses Node 24's global `fetch`: no new dependency. The query endpoint must be confirmed against Wompi's API reference before production (a manual check in quickstart §4); if it differs, only the Wompi adapter changes.

## §4 Secrets: Secret Manager through App Hosting

**Decision**:
- **The secrets**: Wompi's private key, events secret and integrity secret for each country live in **Google Secret Manager**.
- **How they reach the process**: Firebase App Hosting injects them as environment variables (`apphosting.yaml` `env: - variable: WOMPI_CO_INTEGRITY_SECRET, secret: wompi-co-integrity-secret`). There's no Secret Manager client in the code.
- **Where they're read**: an `IPaymentSecrets` port, `forGateway(gateway, countryCode) → secrets | null`, reads `{GATEWAY}_{COUNTRY}_{NAME}` (for example `WOMPI_CO_PRIVATE_KEY`).
- **What stays out of them**: the database keeps the public key and the environment only.
- **Never exposed**: no secret is logged or returned (FR-014, SC-005). Missing secrets for a configured country make starting a top-up fail with `gateway_unavailable`.

**Alternatives considered**: `@google-cloud/secret-manager` at runtime. Rejected: it's a new dependency and a network call per use; App Hosting already resolves Secret Manager at deploy time.

## §5 Applying an outcome exactly once

**Decision**: `ITopUpStore.applyOutcome({ topUpId, status, gatewayTransactionId, amountInCents, currency, now })`, one transaction:
1. **Read the top-up.** A mismatched amount or currency → `mismatch` (no write).
2. **Allowed transitions**:
   - `pending → approved | declined | voided | error | expired`;
   - `expired → approved` (a late payment).

   Anything else → `unchanged`.
3. **Approved** → append two movements with 011's `appendMovementInSession`:
   - `top_up` of the gross amount, cause key `top_up:{id}`;
   - `gateway_fee` of −cost, cause key `gateway_fee:{id}`.

   The cause keys make a repeat a no-op. The new balance is returned.
4. **Status**: set the status, `finalizedAt` and `gatewayTransactionId`, conditional on the status read (a race retries).

**`gateway_fee`** is a new movement type (debit). It's **exempt from the guarded-debit rule**, like penalties: it always follows the larger `top_up` credit of the same transaction. With a negative balance (−30.000 + 20.000), the intermediate balance can still be negative, and the fee must not be refused. The debt is covered by the ledger arithmetic.

## §6 Reconciliation job

**Decision**: A sweep job, `top-up-reconcile`:
- **Query**: `findDueForCheck(now)`: `status: pending, nextCheckAt ≤ now` (index `status_nextCheck`).
- **Schedule**: `nextCheckAt` is set at creation to `createdAt + 15 min`. After each unfinished check it becomes `+1 h`, `+6 h`, `+24 h` from creation; then the top-up is expired at 48 h.
- **Per top-up**: ask the top-up's own gateway (§3), then apply a final answer (§5). Still pending: after 48 h → `expired` (a notice, §7); otherwise the next `nextCheckAt`. Gateway unreachable → retried next run, and nothing changes.
- **Isolation**: one top-up failing doesn't stop the others.

## §7 Notices (clarification 2)

**Decision**: After `applyOutcome` changes a top-up, the caller (the webhook command or the job) sends `notifyOnce` (019):
- **`wallet.top_up_approved`**: "Recarga aprobada: +17.000 COP. Tu saldo es 37.000 COP." Dedupe key `top-up:{id}:approved`.
- **`wallet.top_up_failed`**: "Tu recarga de 20.000 COP no se completó. Puedes intentar con otro medio de pago." Dedupe key `top-up:{id}:failed`.

Domain events aren't used: 013's envelope is booking-shaped, and the notice is the only consumer.

## §8 Return page and app links (clarification 1)

**Decision**:
- **Return page**: `GET /pagos/retorno/{reference}` (public HTML, Spanish). It shows:
  - "Recarga aprobada / pendiente / no completada";
  - the amount and the net;
  - a "Volver a PorterosPRO" button to `config.payments.appOpenUrl`.

  It holds no personal data beyond the amounts. An unknown reference gets a generic "No encontramos esta recarga". The `redirect-url` sent to Wompi is `{config.payments.publicBaseUrl}/pagos/retorno/{reference}`.
- **Link association**: `GET /.well-known/assetlinks.json` (Android package plus SHA-256 fingerprints) and `GET /.well-known/apple-app-site-association` (iOS `appID`, paths `/pagos/retorno/*`), from configuration. When not configured they answer `404`, and the page still works as a page.

## §9 Costs and amounts

**Decision**: Per country, `paymentGatewaySettings`:
- `costs: { percentBps, fixed, vatBps }` (for example `265`, `700`, `1900` for 2.65 % + 700 + 19 % VAT; the administrator seeds the real values);
- `amounts: number[]`.

The cost is computed in integers, without floating point:

```text
raw  = amount × percentBps + fixed × 10 000            (units × 10⁴)
cost = ceil(raw × (10 000 + vatBps) / 10⁸)
net  = amount − cost
```

An amount with `net < 1` is not offered (edge case).

## §10 Terms

**Decision**:
- `ITermsAcceptanceRepository.findLatestForUser(userId)`: the current version is accepted when the latest acceptance's `termsVersion` equals `config.legal.termsVersion`.
- A new `POST /api/profile/terms/accept` records an acceptance of the current terms and privacy versions, with the IP and user agent, like the profile completion.
- Top-up options answer `termsAccepted` and `termsVersion`. Starting without it gives `409 terms_not_accepted`.

## §11 References

`PPR-` + a UUID v7 without dashes: unique, sortable, under Wompi's limits. The unique index `reference_unique` enforces it.
