---

description: "Task list for Wallet Top-ups through Payment Gateways"
---

# Tasks: Wallet Top-ups through Payment Gateways

**Input**: Design documents from `/specs/022-wallet-topups-gateway/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/top-ups.md, quickstart.md

**Tests**: Included, per the repository convention:
- fakes plus `FixedClock`;
- Mongo on mocked collections;
- **a fake payment gateway** in unit and HTTP tests, which signs and checksums exactly like Wompi so the real adapter's verification is exercised with known secrets;
- the Wompi adapter itself is unit-tested against the docs' published examples, and never calls Wompi (`fetch` is injected);
- HTTP with `await buildTestApp()`, `signInGoalkeeper`, `signInAdmin`, `ownerOf` and `TEST_INTERNAL_TOKEN`;
- no real resources.

**Organization**:
- Phase 2: the domain (top-up, settings and cost math, movement type), the ports, the Wompi adapter, secrets, repositories, the store and the fakes.
- Then the stories:
  - **US1**: options and start (plus terms);
  - **US2**: webhook and credit (plus notices);
  - **US3**: reconciliation;
  - **US4**: history;
  - **US5**: administration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US5 (spec.md). Setup, Foundational and Polish tasks carry no label.

---

## Phase 1: Setup

- [X] T001 `src/infrastructure/config.ts`: add `payments: { publicBaseUrl (PAYMENTS_PUBLIC_BASE_URL), appOpenUrl (PAYMENTS_APP_OPEN_URL), androidPackage (ANDROID_APP_PACKAGE), androidCertSha256 (ANDROID_CERT_SHA256, comma-separated), iosAppId (IOS_APP_ID) }`, all optional with empty defaults. In `apphosting.yaml`, add the `env` entries for `WOMPI_CO_PRIVATE_KEY`, `WOMPI_CO_EVENTS_SECRET` and `WOMPI_CO_INTEGRITY_SECRET`, each as `secret:` references (no values), plus the non-secret payment variables as `value:` placeholders. Document them in `.env.example` if it exists.

---

## Phase 2: Foundational

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

- [X] T002 [P] `src/domain/wallet/walletMovement.ts`:
  - `MOVEMENT_TYPES` gains `'gateway_fee'`, with sign −1;
  - `isGuardedDebit` also exempts `gateway_fee` (research §5);
  - `MovementReferences.topUpId` already exists.

  Update the movement and shape tests. Check that the wallet responses map the new type (label `gateway_fee`).
- [X] T003 [P] `src/domain/payments/gatewaySettings.ts` (new):
  - `SUPPORTED_GATEWAYS = ['wompi'] as const`;
  - `GatewayCosts { percentBps; fixed; vatBps }`;
  - `costFor(amount, costs)`, per research §9 (integers, ceil);
  - the `PaymentGatewaySettings` entity `{ countryId, gateway, publicConfig: { publicKey; environment: 'sandbox' | 'production' }, currency, costs, amounts, updatedAt, updatedBy }`. It validates: a supported gateway; a public key prefix that matches the environment (`pub_test_` / `pub_prod_`); bps 0–10 000; `fixed ≥ 0`; 1–10 distinct positive integer amounts, sorted; every amount with net ≥ 1;
  - `options()` → `[{ amount, cost, net }]`.

  Tests in `tests/unit/domain/payments/gatewaySettings.test.ts`: the cost examples (20 000 at 265 bps + 700 + 1900 bps VAT), rounding up, every validation.
- [X] T004 [P] `src/domain/payments/topUp.ts` (new):
  - `TopUpStatus`;
  - the `TopUp` entity (fields per data-model.md);
  - `TopUp.start(...)`, with `status: 'pending'` and `nextCheckAt = createdAt + 15 min`;
  - `canTransition(from, to)` (research §5): pending → any final; expired → approved;
  - `RECONCILE_SCHEDULE_MINUTES = [15, 60, 360, 1440]` and `EXPIRY_MINUTES = 2880`;
  - `nextCheckAfter(topUp, now)` → the next `nextCheckAt` or `'expire'`;
  - `newTopUpReference(uuid)` → `PPR-` + the uuid without dashes.

  Tests in `tests/unit/domain/payments/topUp.test.ts`.
- [X] T005 [P] `src/domain/notifications/topUpMessages.ts` (new):
  - `TOP_UP_APPROVED_TYPE = 'wallet.top_up_approved'` and `TOP_UP_FAILED_TYPE = 'wallet.top_up_failed'`;
  - `topUpApprovedMessage(net, balance, currency, topUpId)`: "Recarga aprobada: +17.000 COP. Tu saldo es 37.000 COP." (reuse `formatAmount`);
  - `topUpFailedMessage(amount, currency, topUpId)`: "Tu recarga de 20.000 COP no se completó. Puedes intentar con otro medio de pago."

  Tests: the texts and a valid push.
- [X] T006 `src/application/features/payments/common/ports.ts` (new), per data-model.md:
  - `GatewayCheckoutArgs`;
  - `GatewayOutcome { reference; transactionId; status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING'; amountInCents; currency }`;
  - `IPaymentGateway { name; buildCheckout(args: { reference; amountInCents; currency; redirectUrl; publicKey; secrets }): string; parseEvent(body): { reference: string } | null; verifyEvent(body, headers, secrets): GatewayOutcome | null; findByReference(reference, env, secrets): Promise<GatewayOutcome | null> }`;
  - `IPaymentGatewayRegistry.get(name)`;
  - `GatewaySecrets { privateKey; eventsSecret; integritySecret }`;
  - `IPaymentSecrets.forGateway(gateway, countryCode)`;
  - `IPaymentGatewaySettingsRepository { getByCountry; save }`;
  - `ITopUpRepository { create; getById; getByReference; listForGoalkeeper(id, skip, limit); countForGoalkeeper; findDueForCheck(now, cap); scheduleNextCheck(id, nextCheckAt, now); }`;
  - `ITopUpStore.applyOutcome(args)`, returning `{ kind: 'applied'; topUp; balance: number | null }` | `{ kind: 'unchanged'; topUp }` | `{ kind: 'mismatch'; topUp }` | `{ kind: 'not_found' }`.
- [X] T007 [P] `src/infrastructure/payments/wompiGateway.ts` (new, `node:crypto`, injected `fetch`), per research §1–§3:
  - `buildCheckout`: the URL with `URLSearchParams` and `signature:integrity`;
  - `parseEvent`: reads `data.transaction.reference` from a `transaction.updated` event;
  - `verifyEvent`: the checksum from `signature.properties` + `timestamp` + `eventsSecret`, compared with `timingSafeEqual` (case-insensitive hex); it maps the transaction;
  - `findByReference`: `GET {base}/v1/transactions?reference=` with `Bearer privateKey`, taking the newest `data[]` item, or `null`. A non-2xx response throws a `GatewayUnavailableError`.

  Tests in `tests/unit/infrastructure/payments/wompiGateway.test.ts`:
  - the docs' integrity example (reference `sk8-438k4-xmxm392-sn2m2`, `4990000`, `COP`, integrity `prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6`) → the SHA-256 of that concatenation;
  - an event checksum computed in the test → verified; a tampered status → `null`; a wrong secret → `null`;
  - `findByReference` with a stubbed `fetch` → the URL, the header and the mapping.
- [X] T008 [P] `src/infrastructure/payments/envPaymentSecrets.ts` (new): reads `{GATEWAY}_{CC}_PRIVATE_KEY`, `_EVENTS_SECRET` and `_INTEGRITY_SECRET` from an injected env map. Any missing → `null`. It never logs the values. `src/infrastructure/payments/gatewayRegistry.ts`: `{ wompi: WompiGateway }`. Tests.
- [X] T009 Mongo:
  - `src/infrastructure/persistence/mongo/paymentGatewaySettingsRepository.ts` (collection `paymentGatewaySettings`, `_id = countryId`);
  - `topUpRepository.ts` (collection `topUps`, indexes `reference_unique`, `goalkeeper_created`, `status_nextCheck`);
  - `topUpStore.ts`, the `applyOutcome` transaction (research §5):
    1. read the top-up;
    2. a mismatch → `mismatch`; `canTransition` false → `unchanged`;
    3. approved → `appendMovementInSession` twice: `top_up` +amount, cause `top_up:{id}`; then `gateway_fee` −cost, cause `gateway_fee:{id}`, both with `references.topUpId`. The owner comes from the args (resolved by the caller, 011's `resolveGoalkeeperWalletContext`);
    4. the conditional status update;
    5. return the new balance.

  Register `ensureIndexes` in `src/infrastructure/di.ts`. Mocked-collection tests for all three.
- [X] T010 [P] Fakes:
  - `tests/fakes/fakePaymentGateway.ts`, which implements `IPaymentGateway` with Wompi's exact signing (it reuses the real adapter's hash helpers), a controllable `findByReference` answer queue and `available` flag, and a helper `signedEvent(transaction, eventsSecret, timestamp)`;
  - `tests/fakes/fakePaymentSecrets.ts`;
  - `fakePaymentGatewaySettingsRepository.ts`;
  - `fakeTopUpRepository.ts`;
  - `fakeTopUpStore.ts`, synchronous, on `FakeWalletStore`.
- [X] T011 [P] Terms: `ITermsAcceptanceRepository` (profile ports) gains `findLatestForUser(userId): Promise<TermsAcceptance | null>`, in Mongo (sort `acceptedAt` desc) and the fake. Test.

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - The goalkeeper tops up with a predefined amount (Priority: P1) 🎯 MVP

**Goal**: Options with cost and net, terms enforced, and a pending top-up with a signed checkout URL.

**Independent Test**: A goalkeeper with accepted terms lists 5 options and starts 20 000 → a pending top-up with a `PPR-` reference and a checkout URL carrying the correct signature.

- [X] T012 [US1] `src/application/features/payments/queries/getTopUpOptions/`:
  - `GetTopUpOptionsQuery(goalkeeperId)` → `{ outcome: 'ok'; available; gateway | null; currency; termsAccepted; termsVersion; options }` | `not_a_goalkeeper` | `{ outcome: 'wallet_not_configured'; cityId }`;
  - it uses 011's wallet context (country), the settings and `findLatestForUser` against `config.legal.termsVersion`.
- [X] T013 [US1] `src/application/features/payments/commands/startTopUp/`: `StartTopUpCommand(goalkeeperId, amount)`.
  - **Outcomes**: `started { topUp, checkoutUrl }` | `not_a_goalkeeper` | `wallet_not_configured` | `invalid_amount` | `terms_not_accepted { termsVersion }` | `top_ups_unavailable` | `gateway_unavailable`.
  - **Flow**:
    1. context;
    2. settings;
    3. the amount among the options;
    4. terms;
    5. the gateway from the registry, and the secrets for `(gateway, country.countryCode)`;
    6. `TopUp.start` (reference via `idGenerator`);
    7. `topUpRepository.create`;
    8. `buildCheckout` with `redirectUrl = {config.payments.publicBaseUrl}/pagos/retorno/{reference}`.

  It never includes secrets in results or logs.
- [X] T014 [US1] `src/application/features/profile/commands/acceptCurrentTerms/` (new): `AcceptCurrentTermsCommand(userId, ip, userAgent)` records a `TermsAcceptance` with the current `termsVersion` and `privacyPolicyVersion`. Add the route `POST /terms/accept` (authenticated) in `src/controllers/profileController.ts` → `201 { termsVersion, privacyPolicyVersion, acceptedAt }`.
- [X] T015 [US1] Routes in `src/controllers/goalkeeperController.ts`:
  - `GET /me/wallet/top-up-options`;
  - `POST /me/wallet/top-ups` (zod `{ amount: int > 0 }` in `src/controllers/requests/payments/startTopUpRequest.ts`).

  Map them exhaustively per contracts §1–§2. Register everything in `src/infrastructure/di.ts` (the real registry, `envPaymentSecrets(process.env)`) and in `tests/http/testAppFactory.ts` (the fakes).
- [X] T016 [P] [US1] Unit tests in `tests/unit/application/features/payments/startTopUp.test.ts`:
  - the options with cost and net;
  - a start → pending, with the reference, the gateway, amounts and `nextCheckAt` +15 min, and a checkout URL with the reference and the correct signature (recomputed in the test);
  - every refusal: an amount outside the list, terms not accepted or accepted in an old version, no settings, missing secrets, not a goalkeeper;
  - no secret in the result (a serialized-JSON search).
- [X] T017 [P] [US1] HTTP `tests/http/controllers/topUps.test.ts` (start section): an admin seeds the Colombia settings through the repository fake; the goalkeeper → options; start → `409 terms_not_accepted`; `POST /api/profile/terms/accept`; start → `201` with `checkoutUrl` starting `https://checkout.wompi.co/p/`; a bad amount → `400`.

**Checkpoint**: SC-001.

---

## Phase 4: User Story 2 - An approved payment credits exactly once (Priority: P1)

**Goal**: Genuine events apply outcomes once. Approvals credit the gross amount and the fee, covering debt. Failures don't credit. Notices go out.

**Independent Test**: A genuine APPROVED event → the balance increases by the net once, and the ledger has `top_up` and `gateway_fee`. The same event again → nothing. A bad checksum → nothing.

- [X] T018 [US2] `src/application/features/payments/common/topUpNotices.ts`: `notifyTopUpOutcome(deps, topUp, balance)`, which calls `notifyOnce` (019) with the approved message (key `top-up:{id}:approved`) or the failed message (key `top-up:{id}:failed`, for declined, voided, error and expired).
- [X] T019 [US2] `src/application/features/payments/commands/applyGatewayEvent/`: `ApplyGatewayEventCommand(gateway, body, headers)`.
  1. the registry gateway; `parseEvent` → the reference; the top-up by reference (unknown → `ignored`, warn);
  2. the secrets for the top-up's own gateway and country;
  3. `verifyEvent` (`null` → `rejected`, warn, no change);
  4. `PENDING` → `ignored`;
  5. otherwise resolve the owner (011) and `applyOutcome`. `mismatch` → a warn with `reference`, `expected` and `got`. `applied` → notices.

  The result is always one of `applied | unchanged | ignored | rejected | mismatch`. An exception → `error` (the controller answers `500`).
- [X] T020 [US2] `src/controllers/paymentWebhooksController.ts` (new, mounted at `/webhooks/payments` in `src/app.ts`, no auth): `POST /:gateway` → the command → `200 {}`, or `500` only on `error`. It logs the outcome, and never the body's secrets or checksum values.
- [X] T021 [P] [US2] Unit tests in `tests/unit/application/features/payments/applyGatewayEvent.test.ts`:
  - an APPROVED event → a credit of `top_up` 20 000 and `gateway_fee` −cost, balance + net, one notice;
  - a repeat → `unchanged`, no new movements, no second notice;
  - DECLINED, VOIDED and ERROR → a final status, no movements, one failed notice;
  - a bad checksum → `rejected`, unchanged;
  - an unknown reference → `ignored`;
  - an amount mismatch → `mismatch`, no credit;
  - a negative balance of −30 000 + a top-up of 20 000 (cost 1 500) → −11 500, with no guarded-debit refusal;
  - an expired top-up then APPROVED → credited;
  - an approved top-up then DECLINED → unchanged.
- [X] T022 [P] [US2] HTTP in `topUps.test.ts` (webhook section): start a top-up; POST a fake-signed APPROVED event to `/webhooks/payments/wompi` → `200`; `GET /api/goalkeepers/me/wallet` balance + net; movements include `top_up` and `gateway_fee`; a repeat → balance unchanged; a tampered event → `200` and unchanged; the goalkeeper's inbox has `wallet.top_up_approved`.

**Checkpoint**: SC-002, SC-003 and SC-006.

---

## Phase 5: User Story 3 - Pending top-ups are reconciled (Priority: P1)

**Goal**: Pending top-ups are asked at 15 min, 1 h, 6 h and 24 h, final answers applied once, and expired at 48 h.

**Independent Test**: A top-up pending 15 minutes, with the gateway answering APPROVED → credited once. Still pending at 48 h → expired with a failed notice.

- [X] T023 [US3] `src/application/features/payments/jobs/topUpReconcileJob.ts` (new, `top-up-reconcile`), per research §6:
  - `findDueForCheck`;
  - per top-up: settings-independent (it uses the top-up's own gateway), the secrets, `findByReference`;
  - a final answer → `applyOutcome` plus notices;
  - still pending → at or past 48 h, expire through `applyOutcome` (status `expired`, no amounts check) plus a failed notice; otherwise `scheduleNextCheck`;
  - `GatewayUnavailableError` → skipped, left for the next run.

  It returns `'N checked, A applied, E expired, F failed'`. Register it in the sweep jobs (DI, test factory) and update the sweep-report expectation in `tests/http/controllers/internalEvents.test.ts`.
- [X] T024 [P] [US3] Unit tests in `tests/unit/application/features/payments/topUpReconcile.test.ts`:
  - not due before 15 min;
  - at 15 min with APPROVED → credited, and a later webhook → unchanged;
  - PENDING → next at 1 h, then 6 h, then 24 h;
  - at 48 h → expired with a failed notice;
  - the gateway down → unchanged and retried;
  - after the country switched gateway, the job still queries the top-up's own gateway.
- [X] T025 [P] [US3] HTTP in `topUps.test.ts`: start; clock +16 min; the fake gateway answers APPROVED; `POST /internal/sweep` → the balance is credited.

**Checkpoint**: SC-002 (lost confirmations).

---

## Phase 6: User Story 4 - The goalkeeper sees their top-ups (Priority: P2)

**Goal**: A paginated list and one read, own top-ups only.

**Independent Test**: After one approved and one declined top-up, the list shows both, newest first.

- [X] T026 [US4] `src/application/features/payments/queries/listTopUps/` and `getTopUp/`, with `toTopUpResponse` (no secrets, no raw gateway data). Routes `GET /me/wallet/top-ups` (paging, reusing the list paging schema) and `GET /me/wallet/top-ups/:topUpId` (`404 top_up_not_found`) in `goalkeeperController.ts`. Register them.
- [X] T027 [P] [US4] Unit and HTTP tests: order, paging, another goalkeeper's → not found.

---

## Phase 7: User Story 5 - An administrator chooses each country's gateway (Priority: P2)

**Goal**: Read and set a country's gateway, public config, costs and amounts. In-flight top-ups are unaffected. Never secrets.

**Independent Test**: The admin sets Colombia → new top-ups use it. Switching doesn't change a pending top-up's gateway.

- [X] T028 [US5] `src/application/features/payments/commands/setGatewaySettings/` and `queries/getGatewaySettings/`. The country must exist (`countryLookup`); the domain validates. Routes `GET` / `PUT /payment-gateways/:countryId` in `src/controllers/adminController.ts` (zod in `src/controllers/requests/payments/gatewaySettingsRequest.ts`), mapped per contracts §7. Register them.
- [X] T029 [P] [US5] Tests: valid → saved and read back; an unsupported gateway, a wrong key prefix or bad amounts → `400`; a non-admin → `403`; a pending top-up keeps `gateway` after a change (unit, with a second fake gateway name registered).

---

## Phase 8: Return page and app links (clarification 1)

- [X] T030 `src/controllers/paymentReturnController.ts` (new, mounted in `src/app.ts`):
  - `GET /pagos/retorno/:reference`: minimal, escaped HTML in Spanish with the status, amount and net, and a "Volver a PorterosPRO" link to `config.payments.appOpenUrl`. Unknown → the "No encontramos esta recarga" page (`200`).
  - `GET /.well-known/assetlinks.json` and `GET /.well-known/apple-app-site-association` (`application/json`) from config, `404` when unset.

  Uses `GetTopUpByReferenceQuery` (read-only, no auth). HTTP tests: the status shown for pending and approved, no personal data, HTML-escaped output, both association files with config and `404` without.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T031 [P] `src/infrastructure/openapi/openapiSpec.ts`: every new route (the goalkeeper ones, `terms/accept`, admin, the webhook and the return page, documented as non-API) and the `gateway_fee` movement type. `docs/payments.md` (new, Spanish): Secret Manager secrets and `apphosting.yaml`, the Wompi dashboard (events URL, keys per environment), the app link setup (Android fingerprints, iOS app id), sandbox test cards, and the manual check of the transactions query endpoint. `docs/push-notifications.md`: the two new types.
- [X] T032 [P] Add "16. Recargas con Wompi (spec 022)" to `_temp_pruebas.md`, from quickstart §0–§4, in Spanish.
- [X] T033 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 runs, 0 failures) and `npm run test:architecture`. Extend `tests/architecture/layering.test.ts` with a rule that forbids `node:crypto` in `src/domain` and `src/application`, so hashing lives only in the Wompi adapter. Fix any failure.
- [ ] T034 Manual, deferred to the end of the roadmap (`_temp_pruebas.md` §16): sandbox payments (approved, declined, PSE and Nequi), a real small production payment, the app links on devices, and confirming Wompi's transactions query endpoint.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (green) → **US1** → **US2** → **US3** → **US4** → **US5** → **Phase 8** → **Polish**.
- US2 needs started top-ups (US1). US3 needs `applyOutcome` and the notices (US2). US4 and US5 are independent of US2 and US3 in code.

### Parallel opportunities

- **Phase 2**:
  1. T002 ∥ T003 ∥ T004 ∥ T005 ∥ T011;
  2. then T006;
  3. then T007 ∥ T008 ∥ T010;
  4. then T009.
- **US1**:
  1. T012 ∥ T013 ∥ T014;
  2. then T015;
  3. then T016 ∥ T017.
- **US2**:
  1. T018;
  2. then T019;
  3. then T020;
  4. then T021 ∥ T022.
- **US3**: T023, then T024 ∥ T025.
- **US4**: T026, then T027.
- **US5**: T028, then T029.
- **Polish**: T031 ∥ T032.

## Implementation Strategy

1. **Phase 1–2**: domain, ports, the Wompi adapter, stores and fakes.
2. **US1 + US2**: the MVP (a goalkeeper can pay and gets credited).
3. **US3**: reconciliation.
4. **US4 + US5 + return page.**
5. **Polish**, then the manual sandbox and production checks.

## Notes

- **Money is exact**: the cause keys `top_up:{id}` and `gateway_fee:{id}`, conditional status updates, and no credit on a mismatch.
- **Secrets never leave the environment**: not the database, logs, responses or errors.
- **Each top-up keeps its gateway**: reconciliation and events use the top-up's own gateway and country, never the country's current setting.
