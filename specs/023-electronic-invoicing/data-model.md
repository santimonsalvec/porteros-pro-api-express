# Data Model: Electronic Invoicing (per country, Colombia first)

**Feature**: `023-electronic-invoicing` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## `walletMovements` (changed, 011)

**New types** (research §4):

| Type | Sign | Guarded debit | Cause key | References |
|---|---|---|---|---|
| `commission_vat` | − | yes | `commission_vat:{bookingId}` | `bookingId`, `requestId` |
| `commission_vat_refund` | + | — | `commission_vat_refund:{bookingId}` | `bookingId`, `requestId` |
| `penalty_vat` | − | no | `penalty_vat:{penaltyEventId}` | as the penalty |
| `penalty_vat_reversal` | + | — | `penalty_vat_reversal:{penaltyMovementId}` | as the reversal |

- **New field `taxRateBps`**: `number | null`. Required (0–10 000) on the four VAT types, and `null` on every other type.
- **Billable types**, the ones that produce a document:
  - `commission_charge` → invoice;
  - `commission_refund` → credit note;
  - `penalty` → invoice;
  - `penalty_reversal` → credit note.

  Their VAT movements travel with them and aren't billable on their own.
- **New index `billable_occurred`**: `{ type: 1, occurredAt: 1 }`, for the safety net (research §2.4).

## `taxSettings` (new)

| Field | Type | Notes |
|---|---|---|
| `_id` | countryId | |
| `vatRateBps` | integer 0–10 000 | 1900 = 19 % |
| `updatedAt`, `updatedBy` | Date, adminId | |

A missing document means 0 %.

## `invoicingSettings` (new)

One document per country (research §10).

| Field | Type | Notes |
|---|---|---|
| `_id` | countryId | |
| `provider` | `'siigo'` | Supported providers only |
| `config` | object | Validated per provider; for Siigo `{ partnerId, invoiceDocumentId, creditNoteDocumentId, sellerId, commissionProductCode, penaltyProductCode, vatTaxId, paymentMethodId }`. Never secrets |
| `updatedAt`, `updatedBy` | Date, adminId | |

Credentials are environment variables `{PROVIDER}_{COUNTRY}_{NAME}` from Secret Manager (e.g. `SIIGO_CO_USERNAME`, `SIIGO_CO_ACCESS_KEY`).

## `cities` (changed, externally owned)

- New optional `daneStateCode` and `daneCityCode` (strings, e.g. `05` and `05001`).
- Seeded by the database owner. Read-only here.

## `invoicingDocuments` (new)

| Field | Type | Notes |
|---|---|---|
| `_id` | uuid v7 | Its base-36 form is the provider's `Idempotency-Key` |
| `kind` | `'invoice' \| 'credit_note'` | |
| `concept` | `'commission' \| 'penalty'` | |
| `goalkeeperId` | string | |
| `countryId` | string | The goalkeeper's country at the charge; picks the settings and credentials |
| `sourceEventId` | string \| null | The event that created it (null when the safety net did) |
| `sourceMovementId` | string | **Unique**: the billable movement |
| `vatMovementId` | string \| null | |
| `bookingId`, `requestId` | string | |
| `originalDocumentId` | string \| null | Credit notes: the invoice of the original charge |
| `base`, `vat`, `total` | integer | Whole COP; `total = base + vat` |
| `vatRateBps` | integer | |
| `currency` | `'COP'` | |
| `buyer` | `{ documentType, documentNumber, firstName, lastName, email, cityId }` | Snapshot (research §5) |
| `status` | `'pending' \| 'awaiting_authority' \| 'issued' \| 'rejected'` | |
| `waitingFor` | string \| null | A credit note waiting for its original |
| `provider` | `{ name: 'siigo'; config; id; number; cufe } \| null` | Set the first time it's sent; never changes afterwards (research §10). It keeps the non-secret `config` it was sent with, so retries, status reads, files and credit notes still work after the country changes provider |
| `attempts` | integer | |
| `nextAttemptAt` | Date \| null | |
| `lastError` | `{ kind: 'transient' \| 'rejected'; code; message; at } \| null` | Never a secret |
| `occurredAt` | Date | The charge's date |
| `createdAt`, `issuedAt`, `updatedAt` | Date | |

**Indexes**:
- `source_unique`: `{ sourceMovementId: 1 }`, unique;
- `goalkeeper_occurred`: `{ goalkeeperId: 1, occurredAt: -1, _id: -1 }`;
- `status_next`: `{ status: 1, nextAttemptAt: 1 }`.

```text
pending ─issued (Accepted)──────────────▶ issued
pending ─created, stamp not final──────▶ awaiting_authority ─Accepted─▶ issued
pending / awaiting ─data error or Rejected─▶ rejected ─admin retry─▶ pending
pending ─transient─▶ pending (attempts+1, backoff)
```

## `outbox` events (changed, 013)

Four new `DomainEventType`s, with the booking envelope: `commission.charged`, `commission.refunded`, `penalty.charged` and `penalty.reversed`.

```text
payload: { goalkeeperId, movementId, vatMovementId | null, base, vat, vatRateBps, currency,
           originalMovementId? (refund/reversal only) }
```

## Ports

| Port | Purpose |
|---|---|
| `IInvoicingProviderRegistry` | `get(name)`: the provider adapters |
| `IInvoicingSecrets` | `forProvider(provider, countryCode)`: credentials or null |
| `IInvoicingSettingsRepository` | `getByCountry`, `save` |
| `IInvoicingProvider` | `ensureCustomer`, `createInvoice`, `createCreditNote`, `getStatus`, `getFile(kind: 'pdf' \| 'xml')`. Errors are classified `transient` or `rejected` |
| `IInvoicingDocumentRepository` | `createIfAbsent` (by `sourceMovementId`), `getById`, `findBySourceMovementId`, `listForGoalkeeper`, `countForGoalkeeper`, `listByStatus`, `findDue(now, cap)`, `findAwaiting(cap)`, `update(conditional on status)` |
| `IBillableMovementScanner` | billable movements older than N minutes without a document (the safety net) |
| `ITaxSettingsRepository` / `IVatRateResolver` | a country's rate |
