# Research: Electronic Invoicing (Colombia)

**Feature**: `023-electronic-invoicing` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

Siigo facts were checked on 2026-09-29 against:
- **Authentication**: https://developers.siigo.com/docs/siigoapi/autenticacion/autenticacion
- **Create invoice**: https://developers.siigo.com/docs/siigoapi/invoice/1-create-invoice/
- **Credit notes**: https://developers.siigo.com/docs/siigoapi/credit-note/4-get-credit-notes/
- **SDK method lists**: https://github.com/SiigoDev/siigo_sdk_javascript (`InvoiceApi.md`, `CreditNoteApi.md`)

---

## §0 What the code does today (findings that shape the design)

- **Commission charges** happen in one place: 012's acceptance transaction (`MongoBookingAcceptanceStore.accept`, through the `commissionDraft` callback), which already records the `goalkeeper.assigned` event in the same transaction.
- **Commission refunds** happen in one place: `refundCommissionInSession` (`bookingLifecycleStore.ts`). It's shared by 016 (cancel all), 017 (client cancellation) and 018 (an administrator reversing a withdrawal), with the cause key `commission_refund:{bookingId}`.
- **There are no money penalties today.** 018 and 021 decided that the money penalty of a withdrawal or a no-show is *not refunding the commission* (already invoiced at acceptance). Their other penalties are suspensions. The ledger's `penalty` / `penalty_reversal` types (011, `WalletLedger.applyPenalty`) exist, but no production path calls them.
- The 013 envelope is booking-shaped (`bookingId`, `requestId`), and every commission charge and refund belongs to a booking.

**Consequence for clarifications 2 and 5 (penalties invoiced, VAT on top)**: this feature defines the penalty events, their VAT drafts and their invoicing, and the invoicing consumer handles them. No producer exists yet. The day a feature charges a money penalty, it must use `penaltyChargeDrafts` and `penaltyCharged` inside its transaction (§3). A withdrawal reversed by an administrator (018) gives the commission back, so it gets a credit note through `commission.refunded`.

## §1 Siigo API

**Decision**: A `SiigoInvoicingProvider` adapter over Node's global `fetch`, behind an `IInvoicingProvider` port. It's the first provider in a registry (§10); every Siigo identifier it sends (document types, seller, products, tax, payment method, `Partner-Id`) comes from the country's settings, and the credentials from that country's secrets.
- **Auth**: `POST https://api.siigo.com/auth` with `{ username, access_key }` and the `Partner-Id` header. It returns an `access_token` valid 24 h. The adapter caches it per instance and renews it 10 minutes before expiry, or after a `401`. Every call sends `Authorization: Bearer …` and `Partner-Id`.
- **Buyer**: the customer must exist in Siigo. `ensureCustomer(buyer)` does `GET /v1/customers?identification=…`, then `POST /v1/customers` when missing, with:
  - `person_type: 'Person'`;
  - `id_type` (§6);
  - `identification`;
  - `name: [first, last]`;
  - `address: { address, city: { country_code: 'CO', state_code, city_code } }`;
  - `contacts: [{ first_name, last_name, email }]`.
- **Invoice**: `POST /v1/invoices` with:
  - `document.id` (the configured sales-invoice type);
  - `date`;
  - `customer.identification`;
  - `seller`;
  - `items: [{ code, description, quantity: 1, price: base, taxes: [{ id: vatTaxId }] }]` (no `taxes` at 0 %);
  - `payments: [{ id: paymentMethodId, value: total, due_date }]`;
  - `stamp: { send: true }` (sent to the DIAN);
  - `mail: { send: true }` (Siigo emails the PDF and the XML to the buyer: clarification 4).
- **Credit note**: `POST /v1/credit-notes` with the configured credit-note type, `invoice` (the original's Siigo id), a reason, the same item, taxes and payment shape, and `stamp` / `mail` send.
- **Idempotency**: Siigo accepts an `Idempotency-Key` header (alphanumeric, ≤ 30 characters) on invoice and credit-note creation. The same key returns the document already created, which covers "the provider issued it but the answer was lost". The key is the document id (UUID v7) as base-36 (≤ 25 characters).
- **Answer and status**: `201 { id, name: 'FV-2-22', number, stamp: { status: 'Draft' | 'Accepted' | 'Rejected', cufe, observations } }`.
  - `Accepted` → issued.
  - `Rejected` → rejected, with the reasons from `GET /v1/invoices/{id}/stamp/errors`.
  - Anything else → awaiting the DIAN, re-read later with `GET /v1/invoices/{id}` (or `/v1/credit-notes/{id}`).
- **Files**: `GET /v1/invoices/{id}/pdf` and `GET /v1/credit-notes/{id}/pdf` (base64 content). The XML is read the same way from `…/{id}/xml`. The XML endpoint is **to be confirmed** in the manual checks; if absent, only the PDF is served and the XML reaches the goalkeeper by email.
- **Errors**:
  - network failure, timeout, `429`, `5xx` → `transient` (retried);
  - `400` / `422` with Siigo's error list → `rejected` (a data problem: not retried automatically);
  - `401` → re-authenticate once, then `transient`.

**Alternatives considered**: creating the customer inline in the invoice. Rejected: it isn't documented as an upsert, and a separate, cached `ensureCustomer` keeps a changed name or email in sync.

## §2 Event-driven issuance that never loses a document (clarification 1)

**Decision**: The 013 outbox, plus a local document queue, plus a safety-net job.

1. **Recorded with the money**: the transaction that appends the commission (and VAT) movements also appends a `commission.charged` event (with `appendEventsInSession`). The refund does the same with `commission.refunded`. No charge without its event, and no event without its charge (FR-002a).
2. **Consumed by a separate process**: Pub/Sub (or the local publisher) delivers the event to the `CreateInvoicingDocument` subscriber. It creates the **pending document**, idempotently: `sourceMovementId` is unique. Then it tries to issue it once.
   - Provider failures are *not* thrown. The document stays `pending` with a `nextAttemptAt`, so the message is acknowledged and never reaches 013's dead-letter for a provider outage.
   - Only a database failure throws, and then Pub/Sub delivers the event again.
3. **Retried by the sweep**: the `invoicing-issuer` job (every minute) does two things:
   - issues due `pending` documents, with a backoff of 1, 5, 15 and 60 minutes, then 3, 6, 12 and 24 hours, then every 24 hours;
   - re-reads documents `awaiting_authority`.
4. **Safety net**: the same job looks for billable ledger movements older than 10 minutes that have no document (for example an event that went to the dead-letter), and creates them. So even a lost event produces its document (SC-003, SC-007).

The acceptance and the refunds never call the provider (SC-007).

**Alternatives considered**:
- Only the ledger as outbox, with no events. Rejected: the owner asked for events, and other consumers may want them.
- Retrying through Pub/Sub alone. Rejected: 5 failed attempts send the message to the dead-letter, and an outage longer than that would need manual work.

## §3 The new events

`DomainEventType` gains four types, each with the booking envelope:

| Type | Recorded by | Payload |
|---|---|---|
| `commission.charged` | the acceptance (012) | `goalkeeperId`, `movementId`, `vatMovementId \| null`, `base`, `vat`, `vatRateBps`, `currency` |
| `commission.refunded` | `refundCommissionInSession` (016/017/018) | the same, for the refund movements, plus `originalMovementId` |
| `penalty.charged` | none yet (§0) | as `commission.charged` |
| `penalty.reversed` | none yet (§0) | as `commission.refunded` |

Commission-refund events are appended in the lifecycle transaction. The lifecycle methods don't hand them to the relay, so the sweep publishes them within a minute (SC-002 allows 5).

## §4 VAT on top (clarifications 3 and 5)

**Decision**:

- **Rates**: `taxSettings`, one document per country: `vatRateBps` 0–10 000, set by administrators. A missing document means 0 % and logs a `vat_not_configured` warning once per sweep. Colombia is seeded at 1900 by the owner.
- **Amount**: `vatFor(base, rateBps) = round-half-up(base × rateBps / 10 000)`, in integers. For example 7 000 × 1900 → 1 330.
- **New movement types**:

  | Type | Sign | Guarded | Cause key |
  |---|---|---|---|
  | `commission_vat` | − | yes, like the commission | `commission_vat:{bookingId}` |
  | `commission_vat_refund` | + | no | `commission_vat_refund:{bookingId}` |
  | `penalty_vat` | − | no, like the penalty | `penalty_vat:{penaltyEventId}` |
  | `penalty_vat_reversal` | + | no | `penalty_vat_reversal:{penaltyMovementId}` |

  Each keeps `taxRateBps`, a new movement field that is null on every other type.
- **Charge**: the acceptance store takes `chargeDrafts(booking) → MovementDraft[]` (the commission, then the VAT when > 0) instead of one draft. Both are appended in the same transaction; if either is refused the whole acceptance aborts with `insufficient_funds`.
- **Refund**: `refundCommissionInSession` also gives back the `commission_vat:{bookingId}` movement found, whatever today's rate is (FR-018).
- **Funds rules (FR-017)**: `grossCharge(commission, rateBps)` = commission + VAT. The goalkeeper's rate is their country's. The wallet context already resolves the country: a new `IVatRateResolver.forCountry(countryId)`. It's used by:
  - `offersStatus` (seeing matches, the wallet view);
  - `canAfford` in `offerEligibility` and in the offer eligibility service;
  - the list of available bookings;
  - the acceptance.
- **Responses**:
  - the wallet view keeps `lowestCommission` (net) and adds `lowestCharge` (gross); `missingAmount` is computed on the gross;
  - available bookings and the agenda add `vat` and `totalCharge` next to `commission`;
  - `insufficient_funds.missingAmount` uses the gross.

## §5 Invoicing documents

**Decision**: `invoicingDocuments` (shape in data-model.md), with a state machine:

```text
pending ──provider accepts, stamp Accepted──▶ issued
pending ──provider accepts, stamp Draft────▶ awaiting_authority ──re-read Accepted──▶ issued
pending ──data error (400/422) or stamp Rejected──▶ rejected ──admin retry──▶ pending
pending ──transient error──▶ pending (attempts + 1, nextAttemptAt)
```

- **Credit notes** wait while their original isn't `issued`: they stay `pending`, `waitingFor: originalId`, re-checked each sweep (US2 scenario 4).
- **Buyer snapshot**: taken when the document is created (seconds after the charge):
  - document type and number from the movement's `invoicing` snapshot (011);
  - first and last name and email from the user;
  - the city from the goalkeeper profile.

  An administrator's retry refreshes it from the current data (US4 scenario 2).
- **Per country (FR-012, FR-013)**: every billable movement gets a document, whatever its country. It's issued with the provider configured for the goalkeeper's country (§10). Without one, it stays `pending` with `lastError.code: provider_not_configured`, and the job re-checks it each run.
- **Pending over 24 hours (FR-010)**: the job logs `invoicing_pending_too_long` with the count, and the administrators' list flags them `stale: true`.

## §6 Buyer data Siigo needs

- **`id_type`** mapping: `cedula_ciudadania` / `CC` → 13, `cedula_extranjeria` / `CE` → 22, `pasaporte` / `PA` → 41, `nit` / `NIT` → 31. An unknown type → rejected (`buyer_document_type_unsupported`).
- **City codes**: Siigo needs the DANE `state_code` and `city_code`. The externally-owned `cities` collection gains optional `daneStateCode` and `daneCityCode`, seeded by the database owner. Missing → rejected (`buyer_city_not_coded`), fixed by seeding and retrying.
- **Address**: the goalkeeper has none, since the platform never collected one. The adapter sends the city name. **To be confirmed** with Siigo in sandbox (quickstart §3). If Siigo or the DIAN requires a street address, a follow-up adds it to the goalkeeper profile.
- **Email**: the user's account email (Google SSO), which always exists.

## §7 Configuration and secrets

- **Per country** (§10): the provider and its non-secret configuration are in `invoicingSettings`, set by administrators. For Siigo:
  - `partnerId`;
  - `invoiceDocumentId`, `creditNoteDocumentId`;
  - `sellerId`;
  - `commissionProductCode`, `penaltyProductCode`;
  - `vatTaxId`;
  - `paymentMethodId`.
- **Secrets** per provider and country (Secret Manager, through `apphosting.yaml`, as in 022): named `{PROVIDER}_{COUNTRY}_{NAME}`, e.g. `SIIGO_CO_USERNAME` and `SIIGO_CO_ACCESS_KEY`. They're read through `IInvoicingSecrets.forProvider(provider, countryCode)`. A missing secret leaves that country's documents pending, with `lastError.code: provider_credentials_missing` and a warning; it's never fatal at startup.
- **Global**: `SIIGO_BASE_URL` (`https://api.siigo.com`), and `INVOICING_ENABLED` (default `false` locally). With it off, the job issues nothing: documents are still created, so nothing is lost when it's turned on.

## §8 Downloads

**Decision**: `GET …/invoices/{id}/pdf` and `…/xml` proxy the provider on demand. The base64 content is decoded and served with `Content-Disposition: attachment; filename="FV-2-22.pdf"`. Nothing is stored locally: Siigo keeps the documents for the legal period. The provider down → `503 provider_unavailable`.

## §9 Testing

- A `FakeInvoicingProvider`, with scripted outcomes: issued, awaiting, rejected, transient, lost answer (idempotency).
- The Siigo adapter is unit-tested with an injected `fetch`:
  - auth and token cache;
  - customer ensure;
  - invoice and credit-note bodies;
  - the `Idempotency-Key`;
  - error classification;
  - PDF decoding.
- No test calls Siigo.

## §10 Providers per country (clarification 6)

**Decision**: Same pattern as 022's gateways.

- **Supported providers**: `SUPPORTED_INVOICING_PROVIDERS = ['siigo']`. An `IInvoicingProviderRegistry.get(name)` returns the adapter; a new country's provider is a new adapter plus a registry entry.
- **Country settings**: `invoicingSettings`, one document per country:
  - `provider`;
  - `config` (validated per provider: for Siigo, every identifier of §7 is a positive integer or a non-empty code);
  - `updatedAt`, `updatedBy`.

  Administrators read and set them at `/api/admin/invoicing/settings/{countryId}`. No secret has a field to go in.
- **Stickiness**: a document records `provider` (name) the first time it's sent. Retries, status reads, file downloads and its credit notes always use that provider, with the credentials of the document's country, never the country's current choice. A document never sent uses the current setting.
- **Buyer data per provider**: the DANE codes and the `id_type` table (§6) belong to the Siigo adapter (Colombia). Another country's adapter maps its own. The buyer snapshot stays generic: document type and number, names, email, city.
- **VAT stays separate** (`taxSettings`, §4): VAT is money in the wallet, charged even in a country without an invoicing provider.

**Alternatives considered**: one global provider in environment variables. Rejected: the owner wants to open other countries with their own providers.
