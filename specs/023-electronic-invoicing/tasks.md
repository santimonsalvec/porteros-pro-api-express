---

description: "Task list for Electronic Invoicing (per country, Colombia first)"
---

# Tasks: Electronic Invoicing (per country, Colombia first)

**Input**: Design documents from `/specs/023-electronic-invoicing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/invoicing.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- Mongo on mocked collections;
- a **`FakeInvoicingProvider`** with scripted outcomes (issued, awaiting, rejected, transient, lost answer);
- the Siigo adapter is unit-tested with an injected `fetch` and never calls Siigo;
- HTTP with `await buildTestApp()`, `signInGoalkeeper`, `signInAdmin`, `ownerOf` and `TEST_INTERNAL_TOKEN`;
- no real resources.

**Organization**:
- **Phase 2**: VAT money rules, events, the invoicing domain, ports, the Siigo adapter, repositories and fakes.
- **US1**: VAT on the charge, and an invoice per charge.
- **US2**: VAT refund, and a credit note per refund.
- **US3**: the goalkeeper's documents.
- **US4**: administration (VAT, provider per country, documents and retry).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US4 (spec.md). Setup, Foundational and Polish tasks carry no label.

---

## Phase 1: Setup

- [X] T001 `src/infrastructure/config.ts`: add `invoicing: { enabled (INVOICING_ENABLED, default false), siigoBaseUrl (SIIGO_BASE_URL, default https://api.siigo.com), issuerCap (INVOICING_ISSUER_CAP, default 100) }`. In `apphosting.yaml`, add `SIIGO_CO_USERNAME` and `SIIGO_CO_ACCESS_KEY` as `secret:` references (no values) and `INVOICING_ENABLED` as a `value:`. Document all of them in `.env.example` (empty values).

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`, `npm run test:http`).

- [X] T002 [P] `src/domain/wallet/walletMovement.ts`:
  - `MOVEMENT_TYPES` gains `commission_vat` (−), `commission_vat_refund` (+), `penalty_vat` (−) and `penalty_vat_reversal` (+);
  - `isGuardedDebit` also exempts `penalty_vat` (a `commission_vat` stays guarded);
  - `WalletMovementProps` gains `taxRateBps: number | null`, which is required (an integer 0–10 000) on the four VAT types and `null` on every other type, enforced in `assertMovementShape`;
  - export `BILLABLE_MOVEMENT_TYPES = ['commission_charge', 'commission_refund', 'penalty', 'penalty_reversal']`.

  Update every `MovementDraft` producer (`walletLedger.ts` drafts, 022's `topUpMovementDrafts`, fakes and fixtures) with `taxRateBps: null`, and the `walletMovementRepository.ts` mapping (absent → null). Update `tests/unit/domain/wallet/walletMovement.test.ts`.
- [X] T003 [P] `src/domain/wallet/vat.ts` (new):
  - `vatFor(base, rateBps)` = round-half-up of `base × rateBps / 10 000` in integers;
  - `grossCharge(commission, rateBps)`.

  Tests: 7 000 × 1900 → 1 330, 0 %, half-up rounding.
- [X] T004 `src/domain/wallet/fundsPolicy.ts`:
  - `offersStatus(balance, zoneCommissions, vatRateBps)` compares on the gross and returns `{ canSeeOffers, lowestCommission, lowestCharge, vatRateBps, missingAmount }`;
  - `canAfford(balance, commission, vatRateBps)` uses the gross.

  `src/domain/bookings/offerEligibility.ts`: the snapshot carries `vatRateBps`, and `canAfford` uses it. Update both tests. Callers are fixed in T017.
- [X] T005 [P] Events:
  - `src/domain/events/domainEvent.ts` gains `'commission.charged' | 'commission.refunded' | 'penalty.charged' | 'penalty.reversed'`.
  - `src/domain/events/billingEvents.ts` (new) has the payload type `BillingEventPayload { goalkeeperId, movementId, vatMovementId: string | null, base, vat, vatRateBps, currency, originalMovementId?: string }` and the builders `commissionCharged`, `commissionRefunded`, `penaltyCharged` and `penaltyReversed` (id, booking envelope, at, payload).
  - Add the four schemas to `src/application/features/events/common/eventSchemas.ts`, and the four types to the delivery-log list (`DELIVERY_LOG_EVENT_TYPES`).

  Tests for the builders and the schema round-trip.
- [X] T006 [P] VAT settings:
  - `src/domain/wallet/taxSetting.ts`: `TaxSetting { countryId, vatRateBps (0–10 000 integer), updatedAt, updatedBy }` with `create` (problems) and `rehydrate` (throws `InvalidConfigurationError`).
  - `ITaxSettingsRepository { getByCountry, save }` in `src/application/features/wallet/common/ports.ts`.
  - `src/application/features/wallet/common/vatRateResolver.ts`: `createVatRateResolver(repo, logger)` → `forCountry(countryId): Promise<number>`, with a missing setting giving 0 and a `vat_not_configured` warning.
  - Mongo `src/infrastructure/persistence/mongo/taxSettingsRepository.ts` (collection `taxSettings`, `_id = countryId`).
  - Fake `tests/fakes/fakeTaxSettingsRepository.ts`.

  Tests.
- [X] T007 [P] `src/domain/invoicing/invoicingDocument.ts` (new), per data-model.md:
  - `InvoicingDocument` (kind, concept, status, buyer, provider, attempts, …);
  - `InvoicingDocument.forCharge(...)` and `.forRefund(...)`, the latter with `originalDocumentId` and `waitingFor`;
  - the transitions `markIssued`, `markAwaiting`, `markRejected(error)`, `markTransient(error, now)` (attempts + 1 and `nextAttemptAt` from the schedule), `resetForRetry(buyer, now)` (rejected → pending) and `bindProvider(name)` (only once);
  - `idempotencyKey()` = the UUID as base-36 (≤ 30 characters);
  - `isStale(now)` (pending or awaiting for more than 24 h).

  `src/domain/invoicing/retrySchedule.ts`: `RETRY_SCHEDULE_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440]`, then every 1440. Tests in `tests/unit/domain/invoicing/`.
- [X] T008 [P] `src/domain/invoicing/invoicingSettings.ts` (new):
  - `SUPPORTED_INVOICING_PROVIDERS = ['siigo']`;
  - `InvoicingSettings { countryId, provider, config, updatedAt, updatedBy }`;
  - a per-provider config validation. Siigo needs `partnerId` (non-empty string), `invoiceDocumentId`, `creditNoteDocumentId`, `sellerId`, `vatTaxId` and `paymentMethodId` (positive integers), and `commissionProductCode` and `penaltyProductCode` (non-empty strings). Unknown keys are refused, so no secret can be stored.
  - `create` returns `{ ok, settings } | { ok: false, problems }`, and `rehydrate` throws.

  Tests.
- [X] T009 `src/application/features/invoicing/common/ports.ts` (new):
  - `InvoicingBuyer`;
  - `ProviderDocumentRef { id, number, cufe | null, status: 'accepted' | 'awaiting' | 'rejected', errors? }`;
  - `InvoicingProviderError`, with `kind: 'transient' | 'rejected'`, `code` and `message`, and never a secret;
  - `IInvoicingProvider { name; ensureCustomer(buyer, ctx); createInvoice(doc, ctx); createCreditNote(doc, original, ctx); getStatus(ref, ctx); getFile(ref, kind, ctx): Promise<{ contentType, fileName, content: Buffer } | null> }`, where `ctx = { config, secrets, countryCode }`;
  - `IInvoicingProviderRegistry`;
  - `IInvoicingSecrets.forProvider(provider, countryCode)`;
  - `IInvoicingSettingsRepository`;
  - `IInvoicingDocumentRepository` (per data-model.md, with `createIfAbsent` returning `{ created: boolean; document }` and `update(document, expectedStatus)`);
  - `IBillableMovementScanner.findWithoutDocument(olderThan, cap)`;
  - `IInvoicingLogger`.
- [X] T010 [P] `src/infrastructure/invoicing/siigoInvoicingProvider.ts` (new, injected `fetch`), per research §1 and §6:
  - **Auth**: `POST {base}/auth` with the `Partner-Id` header, and a token cached per `countryCode + username` until 10 minutes before `expires_in`. A `401` re-authenticates once.
  - **`ensureCustomer`**: `GET /v1/customers?identification=`, then `POST` or `PUT` when missing or changed. Uses `person_type: 'Person'`, the `id_type` table (`cedula_ciudadania`/`CC` → 13, `cedula_extranjeria`/`CE` → 22, `pasaporte`/`PA` → 41, `nit`/`NIT` → 31; unknown → rejected `buyer_document_type_unsupported`), the name, the address = city name, the city `{ country_code: 'CO', state_code, city_code }` from the buyer's DANE codes (missing → rejected `buyer_city_not_coded`) and the contact email.
  - **Invoice**: `POST /v1/invoices` with the `Idempotency-Key` header, `document.id`, `date`, `customer.identification`, `seller`, `items: [{ code: the concept's product, description, quantity: 1, price: base, taxes: vat > 0 ? [{ id: vatTaxId }] : [] }]`, `payments: [{ id, value: total, due_date }]`, `stamp.send` and `mail.send`.
  - **Credit note**: `POST /v1/credit-notes`, likewise, with `invoice: original.provider.id`.
  - **Status mapping**: `Accepted` → accepted; `Rejected` → rejected, with the reasons from `GET …/stamp/errors`; anything else → awaiting. `getStatus` re-reads the document.
  - **`getFile`**: `GET …/{id}/pdf|xml` (base64 → Buffer); a `404` → null.
  - **Error classes**: network, timeout, `429` and `5xx` → transient; `400` and `422` → rejected with Siigo's messages; never a credential in an error.

  Tests in `tests/unit/infrastructure/invoicing/siigoInvoicingProvider.test.ts`: the auth body and headers, the token reuse, the customer create vs. existing, the invoice and credit-note bodies (base, tax id, `Idempotency-Key`), each error class, the PDF decoding, and no secret in errors.
- [X] T011 [P] `src/infrastructure/invoicing/envInvoicingSecrets.ts` (`{PROVIDER}_{CC}_USERNAME` and `_ACCESS_KEY` from an injected env; any missing → null) and `invoicingProviderRegistry.ts`. Tests.
- [X] T012 Mongo:
  - `src/infrastructure/persistence/mongo/invoicingDocumentRepository.ts` (collection `invoicingDocuments`; indexes `source_unique`, `goalkeeper_occurred`, `status_next`; `createIfAbsent` on `sourceMovementId`, where a duplicate-key error returns the existing one; `update` is conditional on the expected status);
  - `invoicingSettingsRepository.ts` (collection `invoicingSettings`);
  - `billableMovementScanner.ts`, which reads billable `walletMovements` with `occurredAt ≤ now − 10 min` within the last 7 days and returns those whose `_id` isn't a `sourceMovementId` in `invoicingDocuments`, capped.

  Add the `walletMovements` index `billable_occurred` in `walletMovementRepository.ensureIndexes`. Register the `ensureIndexes` in `src/infrastructure/di.ts`. Mocked-collection tests.
- [X] T013 [P] `src/domain/locations/city.ts`: optional `daneStateCode` and `daneCityCode` (null when absent), mapped in `cityRepository.ts` and the fake. Tests.
- [X] T014 [P] Fakes:
  - `tests/fakes/fakeInvoicingProvider.ts`: records every call, has a scripted outcome queue per operation (`accepted`, `awaiting`, `rejected`, `transient`, `lost_answer`, which creates the document and then throws transient, so the idempotency key returns it next time), and a `files` map;
  - `fakeInvoicingSecrets.ts` (`siigo:CO` present by default);
  - `fakeInvoicingSettingsRepository.ts` (with `seed()` for Colombia);
  - `fakeInvoicingDocumentRepository.ts`;
  - `fakeBillableMovementScanner.ts` (over `FakeWalletStore` and the document fake).

**Checkpoint**: tsc and all suites are green, and behavior is unchanged: every VAT rate is 0 until configured.

---

## Phase 3: User Story 1 - Every billable charge gets exactly one electronic invoice (Priority: P1) 🎯 MVP

**Goal**: The acceptance debits the commission plus VAT and records `commission.charged`. A separate process issues exactly one invoice through the country's provider, and retries or waits without ever losing it.

**Independent Test**: At 19 %, accepting a 7 000 booking debits 7 000 + 1 330 and records the event. The subscriber creates one pending document and the fake provider issues it. Delivering the event again changes nothing. A transient failure is issued by the sweep later.

- [X] T015 [US1] `src/application/features/wallet/common/walletLedger.ts`:
  - `commissionVatDraft(owner, { bookingId, requestId, base, rateBps }, id, at)` → a `commission_vat` draft, cause `commission_vat:{bookingId}`, or `null` at 0 %;
  - `penaltyChargeDrafts(owner, { penaltyEventId, amount, rateBps, references }, ids, at)` → the penalty and `penalty_vat` drafts, with no producer yet (research §0).

  Tests.
- [X] T016 [US1] Acceptance (012):
  - `IBookingAcceptanceStore.accept` takes `chargeDrafts: (booking) => MovementDraft[]` instead of `commissionDraft`, and `events: (booking, charged: WalletMovement[]) => DomainEvent[]`.
  - `MongoBookingAcceptanceStore` appends every draft in order; any `insufficient_funds` aborts the whole transaction. It then appends the events (`goalkeeper.assigned` plus `commission.charged` with the movement ids).
  - `FakeBookingAcceptanceStore` checks the total before appending, so nothing is half-written.
  - `AcceptBookingCommandHandler` resolves the goalkeeper's rate (`vatRateResolver.forCountry(context.countryId)`), checks `canAfford` on the gross, sets `missingAmount` on the gross, builds the drafts and events, and relays both events.

  Update the unit and HTTP tests of 012 and 015 that assert movements and events (for example `goalkeeperAcceptBooking.test.ts`, `domainEventsRecording.test.ts`) for 0 % (unchanged), and add the 19 % cases.
- [X] T017 [US1] Funds on the gross (FR-017):
  - `GetGoalkeeperWalletQueryHandler` (`offers` gains `lowestCharge` and `vatRateBps`);
  - `offerEligibilityService.ts` (snapshot `vatRateBps`);
  - `listAvailableBookings` and `listGoalkeeperAgenda` (items gain `vat` and `totalCharge`).

  Inject the VAT resolver in `di.ts` and `tests/http/testAppFactory.ts`, and expose `taxSettingsRepository` in the test context. Update the affected expectations (`goalkeeperWallet.test.ts`, `goalkeeperAvailableBookings.test.ts`, `offersNotification.test.ts`, …).
- [X] T018 [US1] `src/application/features/invoicing/common/issueDocument.ts`: `issueDocument(deps, document, now)`.
  1. A credit note whose original isn't issued → `waiting` (stays pending, `waitingFor` set).
  2. The provider name is `document.provider?.name` (sticky), else the country's `invoicingSettings.provider`. None → `markTransient({ code: 'provider_not_configured' })`.
  3. The settings config and the secrets for `(provider, country.countryCode)`. Missing → transient `provider_credentials_missing`.
  4. `INVOICING_ENABLED` false → left untouched.
  5. `bindProvider`, `ensureCustomer`, then `createInvoice` or `createCreditNote`.
  6. Map the answer: accepted → `markIssued`; awaiting → `markAwaiting`; rejected → `markRejected`; a thrown transient → `markTransient`.
  7. `repository.update(doc, expectedStatus)`.

  It never throws for provider problems, and logs `invoicing_document_{issued|rejected|retry}` without secrets.
- [X] T019 [US1] `src/application/features/invoicing/handlers/createInvoicingDocument.ts`: a subscriber for `commission.charged` and `penalty.charged` (US2 adds the other two).
  - It reads the movement (add `findById` to `IWalletMovementRepository`, Mongo and fake), the user (names, email) and the goalkeeper profile (`cityId`, country via city → region).
  - It builds the buyer from the movement's `invoicing` snapshot plus those.
  - It calls `createIfAbsent`, then `issueDocument` once.
  - A database error throws, so the event is redelivered.

  Register it with `registerSubscribers` in `di.ts` and the test factory.
- [X] T020 [US1] `src/application/features/invoicing/jobs/invoicingIssuerJob.ts` (`invoicing-issuer`), per research §2:
  1. `findDue(now, cap)` → `issueDocument`;
  2. `findAwaiting(cap)` → `getStatus` with the document's provider → issued or rejected;
  3. the safety net: `scanner.findWithoutDocument(now − 10 min, cap)` → create the document (with `sourceEventId: null`) and issue it;
  4. the count of stale documents → a `invoicing_pending_too_long` warning.

  It returns `'N issued, A awaiting, R rejected, T retried, S recovered'`. Register it last in the sweep jobs (DI, test factory) and update the report in `tests/http/controllers/internalEvents.test.ts`.
- [X] T021 [P] [US1] Unit tests in `tests/unit/application/features/invoicing/`, over an `invoicingHarness.ts` (wallet world plus fakes):
  - the charge event → one document and one provider invoice with base, VAT and total, and the buyer snapshot;
  - a redelivery → no second document or call;
  - transient → pending with `nextAttemptAt`, then issued by the job, once;
  - lost answer → the job issues it through the same idempotency key, and the fake reports one document;
  - awaiting → issued on re-read;
  - rejected → rejected with reasons, not retried;
  - no provider for the country → pending `provider_not_configured`, issued after the settings are seeded;
  - missing credentials → pending, with no secret in the logs;
  - the safety net recovers a movement without an event;
  - stale → warning;
  - a document keeps its provider after the country's settings change.
- [X] T022 [P] [US1] HTTP `tests/http/controllers/invoicing.test.ts` (charge section): 19 % VAT and Colombia's settings seeded; a goalkeeper with 10 000 accepts a 7 000 booking → movements `commission_charge −7000` and `commission_vat −1330`; the fake provider has one invoice with base 7 000 and VAT 1 330; the goalkeeper with 7 500 → available bookings exclude it, and accept → `409 insufficient_funds` with `missingAmount: 830`.

**Checkpoint**: SC-001, SC-002, SC-003 and SC-007.

---

## Phase 4: User Story 2 - Refunds and reversals are reflected with credit notes (Priority: P1)

**Goal**: A refund gives back the commission and its VAT and records `commission.refunded`. One credit note, referencing the original, is issued after it.

**Independent Test**: Accept, then cancel as the client → `commission_refund` and `commission_vat_refund`, and one credit note for 8 330 referencing the invoice.

- [X] T023 [US2] `refundCommissionInSession` (`src/infrastructure/persistence/mongo/bookingLifecycleStore.ts`) and `tests/fakes/fakeBookingLifecycleStore.ts`:
  - also give back `commission_vat:{bookingId}` when present, as `commission_vat_refund` with the same rate and cause `commission_vat_refund:{bookingId}`;
  - append `commission.refunded` (`originalMovementId` = the charge) with `appendEventsInSession`, once per refund;
  - return `{ amount, vat, currency }`, and the `booking.cancelled` payload's `refundedAmount` stays the commission.

  Cover 016 (cancel all), 017 (client) and 018 (admin reversal) in their existing store tests and fakes.
- [X] T024 [US2] The subscriber handles `commission.refunded` and `penalty.reversed`: the original document is found by `findBySourceMovementId(originalMovementId)` (created from the original movement first, if missing), and a `credit_note` is created with `originalDocumentId`. `issueDocument` waits for the original, and uses the original's provider.
- [X] T025 [P] [US2] Tests:
  - unit: the credit note waits for its original and then is issued once; the credit note of a refund in the same minute is issued after its invoice; a redelivery creates no second credit note; the credit note uses the original's provider after a settings change; a refund at 0 % → no VAT refund;
  - HTTP in `invoicing.test.ts` (refund section): accept then client-cancel → the wallet is back where it started, and the fake provider has the invoice and one credit note referencing it.

**Checkpoint**: SC-004.

---

## Phase 5: User Story 3 - The goalkeeper consults and downloads their invoices (Priority: P2)

- [X] T026 [US3] `src/application/features/invoicing/queries/listMyDocuments/`, `getMyDocument/` and `getDocumentFile/`, with `common/documentResponses.ts` (`toDocumentItem`, per contracts §1). Routes in `src/controllers/goalkeeperController.ts`:
  - `GET /me/invoices` (reuses the paging schema);
  - `GET /me/invoices/:documentId` (`404 invoicing_document_not_found`);
  - `GET /me/invoices/:documentId/pdf|xml`:
    - `409 document_not_issued`;
    - `404 file_not_available`;
    - `503 provider_unavailable`;
    - otherwise the file with `Content-Type` and `Content-Disposition: attachment`, using the document's own provider.

  Register them.
- [X] T027 [P] [US3] Tests: own documents only, newest first, paging; the PDF bytes served; pending → 409; another goalkeeper's → 404; the provider down → 503.

---

## Phase 6: User Story 4 - Administrators configure each country's provider, watch invoicing and retry failures (Priority: P2)

- [X] T028 [US4] VAT: `commands/setTaxSettings/` and `queries/getTaxSettings/` (the country must exist). Routes `GET` / `PUT /tax-settings/:countryId` in `src/controllers/adminController.ts` (zod `{ vatRateBps: int 0–10000 }` in `src/controllers/requests/invoicing/taxSettingsRequest.ts`), per contracts §3b.
- [X] T029 [US4] Provider per country: `commands/setInvoicingSettings/` and `queries/getInvoicingSettings/` (the domain validates; the answer adds `credentialsPresent` from `IInvoicingSecrets`, never values). Routes `GET` / `PUT /invoicing/settings/:countryId` (zod in `src/controllers/requests/invoicing/invoicingSettingsRequest.ts`, strict), per contracts §3.
- [X] T030 [US4] Documents: `queries/listDocumentsForAdmin/` (by status, oldest first, with `stale`, buyer, attempts, `lastError`, provider and country) and `commands/retryDocument/` (only when rejected → `resetForRetry` with a fresh buyer, then `issueDocument` right away; otherwise `document_not_retryable`). Routes `GET /invoicing/documents` and `POST /invoicing/documents/:documentId/retry`, per contracts §2. Register everything.
- [X] T031 [P] [US4] Tests:
  - the VAT set, read back and applied only to later charges;
  - the provider settings valid → saved, with `credentialsPresent`; an unsupported provider, a missing config field or an unknown (secret-like) key → 400; non-admin → 403;
  - rejected → listed with its reason, then retried after fixing the buyer's city codes → issued; retrying an issued one → 409.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T032 [P] `src/infrastructure/openapi/openapiSpec.ts`: every new route, the new movement types and `taxRateBps`, the wallet `offers` fields, and the booking items' `vat` and `totalCharge`. `docs/invoicing.md` (new, Spanish) covers:
  - the providers per country;
  - Siigo setup (account, resolution, products, tax, document types, seller, payment method, credentials in Secret Manager);
  - the DANE codes;
  - VAT;
  - operations (states, retries, the safety net, rejected documents);
  - how to add a new country's provider.

  `docs/events-infrastructure.md` gets the four new event types.
- [X] T033 [P] Add "17. Facturación electrónica (spec 023)" to `_temp_pruebas.md`, from quickstart §0–§5, in Spanish.
- [X] T034 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T035 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §17): the Siigo sandbox (invoice, credit note, rejection, outage), a buyer without a street address, the XML endpoint, and production.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US1** → **US2** → **US3** / **US4** → **Polish**.
- US2 needs the subscriber and `issueDocument` (US1). US3 and US4 need the documents (US1), and are independent of each other.

### Parallel opportunities

- **Phase 2**:
  1. T002 ∥ T003 ∥ T005 ∥ T006 ∥ T007 ∥ T008 ∥ T013;
  2. then T004 and T009;
  3. then T010 ∥ T011 ∥ T014;
  4. then T012.
- **US1**: T015, then T016 → T017; T018 → T019 → T020; then T021 ∥ T022.
- **US2**: T023 → T024 → T025.
- **US3**: T026 → T027.
- **US4**: T028 ∥ T029 ∥ T030, then T031.
- **Polish**: T032 ∥ T033.

## Implementation Strategy

1. **Phase 1–2**: money rules, events, the invoicing domain, adapters, stores and fakes. Behavior is unchanged at 0 % VAT.
2. **US1**: the MVP (VAT charged, each commission invoiced).
3. **US2**: credit notes.
4. **US3 + US4**: reads and administration.
5. **Polish**, then the manual Siigo sandbox and production checks.

## Notes

- **Money is exact**: VAT and commission in one transaction; refunds give back exactly what was charged.
- **One document per billable movement**: `sourceMovementId` is unique, and the provider's `Idempotency-Key` covers lost answers.
- **Never lost**: the outbox event, the document queue, the sweep and the safety net.
- **Secrets never leave the environment**: not the database, logs, responses or errors.
- **Each document sticks to its first provider.**
