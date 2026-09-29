# Implementation Plan: Electronic Invoicing (per country, Colombia first)

**Branch**: `023-electronic-invoicing` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-electronic-invoicing/spec.md`

## Summary

**VAT on top** (clarifications 3 and 5): each country has a VAT rate set by administrators (`taxSettings`). Accepting a booking debits the commission and, in the same transaction, a `commission_vat` movement. Refunds give both back. Every funds rule compares the balance with the commission plus VAT.

**Event-driven invoicing** (clarification 1):
- The acceptance and the refund record `commission.charged` / `commission.refunded` in 013's outbox, in the same transaction as the movements.
- A subscriber creates a pending **invoicing document**, unique per movement, and tries to issue it through **the provider configured for the goalkeeper's country** (Siigo for Colombia first): an invoice for a charge, a credit note for a refund, referencing the original.
- Provider failures leave the document pending. The `invoicing-issuer` sweep job retries with backoff, re-reads documents awaiting the DIAN, and, as a safety net, creates any document whose event was lost.
- Siigo's `Idempotency-Key` makes a lost answer harmless. Siigo emails each document to the goalkeeper.

**Providers per country** (clarification 6): administrators set each country's provider and its non-secret configuration (`invoicingSettings`); the credentials are per provider and country in Secret Manager (`SIIGO_CO_USERNAME`, …). Documents keep the provider they were first sent to; a country without a provider keeps its documents pending until it has one.

**Reads**: goalkeepers list their documents and download the PDF and XML. Administrators list them by status, see rejection reasons and retry rejected ones, and set VAT per country.

**Penalties** (clarification 2): today no feature charges money penalties (research §0), so their events, VAT drafts and invoicing are ready, with no producer yet.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only.
- Siigo is called over REST with Node's global `fetch`.
- The secrets come from Secret Manager through App Hosting environment variables (as in 022).

No new dependency.
**Storage**: MongoDB (Atlas, transactions).
- New collections `invoicingDocuments`, `invoicingSettings` and `taxSettings`.
- Four new VAT movement types and a `taxRateBps` field on movements.
- A new `walletMovements` index `billable_occurred`.
- Optional DANE codes on `cities`.
- Four new outbox event types.

**External**: the Siigo API (auth, customers, invoices, credit notes, files), which stamps documents before the DIAN and emails them.
**Testing**: As 011–022.
- **Unit**:
  - VAT math and movement shapes;
  - the acceptance and refund transactions with VAT and events (mocked collections and fakes);
  - the funds rules on the gross;
  - the document state machine;
  - the subscriber (idempotency, every country, credit notes waiting for their original);
  - the issuer job (backoff, awaiting, safety net, stale warning);
  - the Siigo adapter with an injected `fetch` (auth cache, customer, bodies, `Idempotency-Key`, error classes, PDF decoding).
- **HTTP**, with a `FakeInvoicingProvider`: accept → invoice issued; cancel → credit note; list and download; admin list, retry and VAT; the funds changes.

**Target Platform**: Firebase App Hosting (Cloud Run).
**Project Type**: Single backend web service.
**Performance Goals**:
- the acceptance adds only local writes (SC-007);
- documents are issued within about a minute of the event with the provider up (SC-002);
- the sweep job is capped per run.

**Constraints**:
- exactly one document per billable movement;
- charges never wait for or depend on the provider;
- no secret in the database, logs or responses;
- each document sticks to the provider it was first sent to.

**Scale/Scope**: At most a few hundred documents a day.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution is still the template. The 001–022 discipline applies:
- **Layering**: VAT math, movement types, document state and the buyer mapping in the domain. Commands, queries, the subscriber and the job in the application, behind ports. Siigo, Mongo and the controllers in infrastructure.
- **CQRS** with exhaustive mappings.
- **Fakes, no real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: passes. Cross-feature edits are deliberate:
- 011: movement types, the `taxRateBps` field and the funds policy;
- 012: acceptance drafts, the event, the funds and the responses;
- 013: event types and schemas;
- 015: eligibility on the gross;
- 016–018: `refundCommissionInSession` gives back VAT and records `commission.refunded`;
- the sweep job list, `di.ts`, the admin and goalkeeper controllers, and `apphosting.yaml`.

## Project Structure

### Documentation (this feature)

```text
specs/023-electronic-invoicing/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/invoicing.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── wallet/walletMovement.ts            # MODIFIED: 4 VAT types, taxRateBps, guards
│   ├── wallet/vat.ts                       # NEW: vatFor, grossCharge
│   ├── wallet/fundsPolicy.ts               # MODIFIED: gross (lowestCharge)
│   ├── bookings/offerEligibility.ts        # MODIFIED: canAfford on the gross
│   ├── events/domainEvent.ts, billingEvents.ts   # MODIFIED / NEW: 4 event types + builders
│   └── invoicing/invoicingDocument.ts, invoicingSettings.ts, retrySchedule.ts   # NEW
├── application/features/
│   ├── wallet/common/walletLedger.ts       # MODIFIED: VAT drafts (commission, penalty)
│   ├── wallet/common/vatRateResolver.ts    # NEW
│   ├── goalkeeperRequests/…/acceptBooking  # MODIFIED: chargeDrafts, commission.charged, gross funds
│   ├── notifications/common/offerEligibilityService.ts, …/listAvailableBookings  # MODIFIED: gross
│   ├── events/common/eventSchemas.ts       # MODIFIED: 4 schemas
│   └── invoicing/                          # NEW slice
│       ├── common/ports.ts, issueDocument.ts, documentResponses.ts
│       ├── handlers/createInvoicingDocument.ts        # the event subscriber
│       ├── jobs/invoicingIssuerJob.ts
│       ├── queries/listMyDocuments/, getMyDocument/, getDocumentFile/, listDocumentsForAdmin/, getTaxSettings/
│       └── commands/retryDocument/, setTaxSettings/, setInvoicingSettings/ (+ queries/getInvoicingSettings/)
├── infrastructure/
│   ├── invoicing/siigoInvoicingProvider.ts (+ Siigo id_type/DANE mapping), invoicingProviderRegistry.ts, envInvoicingSecrets.ts   # NEW
│   ├── persistence/mongo/invoicingDocumentRepository.ts, invoicingSettingsRepository.ts, taxSettingsRepository.ts, billableMovementScanner.ts  # NEW
│   ├── persistence/mongo/bookingAcceptanceStore.ts, bookingLifecycleStore.ts, walletMovementRepository.ts  # MODIFIED
│   ├── config.ts, di.ts, openapi/openapiSpec.ts      # MODIFIED
└── controllers/
    ├── goalkeeperController.ts             # MODIFIED: /me/invoices…
    └── adminController.ts                  # MODIFIED: /invoicing/documents…, /invoicing/settings/:countryId, /tax-settings/:countryId
apphosting.yaml, .env.example               # MODIFIED: SIIGO_CO_* (secrets as references), INVOICING_ENABLED
docs/invoicing.md                           # NEW: Siigo setup, DANE codes, VAT, operations
```

**Structure Decision**: Invoicing is its own `invoicing` slice.
- **VAT** lives with the wallet: it's money in the ledger.
- **Events** reuse 013's outbox, relay and consumers.
- **Providers** follow 022's gateway pattern: a registry, settings per country, secrets per provider and country, and stickiness per document.
- **Documents** keep their own queue, so provider retries never depend on Pub/Sub's dead-letter limit.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| A local document queue plus a safety-net scan, besides the outbox events | The owner asked for event-driven issuance that never loses a document | Retrying through Pub/Sub alone ends in the dead-letter after 5 attempts; a Siigo outage lasts longer than that |
