---

description: "Task list for Goalkeeper Wallet and Platform Commission"
---

# Tasks: Goalkeeper Wallet and Platform Commission

**Input**: Design documents from `/specs/011-goalkeeper-wallet/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/goalkeeper-wallet.md, contracts/admin-wallet.md, quickstart.md

**Tests**: Included, following this repository's convention (001–010):
- hand-written fakes and `FixedClock`;
- repositories and stores tested against `tests/fakes/fakeMongoCollection.ts` plus a mocked `startSession().withTransaction` (as in `quoteConfirmationStore.test.ts`);
- HTTP tests with **`await buildTestApp()`**;
- no real database. Real concurrency is a manual check (Polish).

**Organization**:
- Phases follow **dependency order**, not strict priority order. The wallet read of US2 shows the offers status, which needs the commission (US3) and the funds rules (US4). So the order is US1 → US3 → US4 → US2 → US5. All of US1–US4 are P1.
- US1 builds the ledger (the only writer).
- US5 is the first HTTP caller that writes: the admin adjustment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency on an incomplete task)
- **[Story]**: US1–US5 (spec.md). Setup, Foundational and Polish tasks carry no story label
- Paths are exact and match plan.md's Project Structure

---

## Phase 1: Setup

- [X] T001 [P] Create `src/infrastructure/auth/middleware/requireAdmin.ts`, mirroring `requireClientOnly.ts`: pass only when `req.authClaims?.isAdmin === 'true'`, else `res.status(403).end()`. Add a doc comment. Add cases to `tests/unit/infrastructure/auth/authorizationMiddleware.test.ts`: `'true'` passes; `'false'` and a missing claim → 403 with no body.

---

## Phase 2: Foundational (domain + ports)

**⚠️ CRITICAL**: Blocks every story.

- [X] T002 [P] Create `src/domain/wallet/walletMovement.ts`:
  - `MOVEMENT_TYPES` / `type MovementType`, per data-model.md;
  - `type MovementActor = { kind: 'system' | 'goalkeeper' | 'admin'; userId: string | null }`;
  - `interface MovementReferences { bookingId?; requestId?; topUpId?; caseId?; penaltyMovementId? }`;
  - `interface CancellationDetails { by: 'client' | 'system' | 'admin'; at: Date; reason: string }`;
  - `interface InvoicingSnapshot { documentType: string; documentNumber: string }`;
  - class `WalletMovement extends Entity<string>`, with fields `walletId, sequence, type, amount, currency, balanceAfter, occurredAt, causeKey, actor, references, cancellation, reason, invoicing`, and `static rehydrate(props)`.

  The constructor validates:
  - `amount` is a non-zero integer, with the sign per type from data-model.md ("MovementType and signs"; `admin_adjustment` may take either sign);
  - `sequence` ≥ 1;
  - `currency` matches `/^[A-Z]{3}$/`;
  - `cancellation` is non-null only on `commission_refund`;
  - `reason` is a non-empty string on `admin_adjustment`, null otherwise.

  Violations throw an `Error` naming the field. Export `isGuardedDebit(type, amount)`: true for any negative amount except `penalty` (research §2). Add `tests/unit/domain/wallet/walletMovement.test.ts` (one valid movement per type; every violation; `isGuardedDebit` cases).
- [X] T003 [P] Create `src/domain/wallet/wallet.ts`: class `Wallet { goalkeeperId; currency; balance; lastSequence; createdAt; updatedAt }` with `static rehydrate(props)` and `static empty(goalkeeperId, currency, now)` (balance 0, lastSequence 0). Add `tests/unit/domain/wallet/wallet.test.ts`.
- [X] T004 Create `src/application/features/wallet/common/ports.ts` exactly as in data-model.md "Application":
  - `MovementDraft` (all the `WalletMovement` fields except `id`, `sequence` and `balanceAfter`, plus `goalkeeperId`);
  - `AppendResult`;
  - the interfaces `IWalletStore`, `IWalletRepository`, `IWalletMovementRepository`, `ICommissionSettingRepository` (`findFor(refs: { zoneIds: string[]; cityIds: string[]; countryIds: string[] }): Promise<CommissionSetting[]>`) and `ICommissionResolver`.

  Import `CommissionSetting` as a type from `src/domain/wallet/commissionSetting.ts` (created in T015). Until then, declare the port with the import and let `tsc` resolve it after T015.
- [X] T005 Create `src/application/features/wallet/common/goalkeeperWalletContext.ts` with `resolveGoalkeeperWalletContext(deps, goalkeeperId)`, where deps are `IGoalkeeperProfileRepository`, `ICityRepository`, `IRegionRepository` and `ICountryLookup`. It returns one of:
  - `{ kind: 'not_a_goalkeeper' }` when there is no `GoalkeeperProfile`;
  - `{ kind: 'wallet_not_configured'; cityId }` when the country or currency can't be resolved (profile `cityId` → city → region `countryId` → country `currency`, the same path as `resolveAreaSettings` in `goalkeeperRequests/common/serviceArea.ts`);
  - `{ kind: 'ok'; profile; currency; countryId; invoicing: { documentType, documentNumber } }`.

  Add `tests/unit/application/features/wallet/goalkeeperWalletContext.test.ts` using the existing fakes (`FakeGoalkeeperProfileRepository`, `FakeCityRepository`, `FakeRegionRepository`, `FakeCountryRepository`).

**Checkpoint**: domain and ports compile (except the `CommissionSetting` import, resolved in T015).

---

## Phase 3: User Story 1 - Every change is a recorded movement (Priority: P1) 🎯 MVP

**Goal**: An append-only, idempotent, concurrency-safe ledger, with `WalletLedger` as the only writer.

**Independent Test**: +20.000, −7.000, +7.000 and −7.000 (penalty) give resulting balances of 20.000, 13.000, 20.000 and 13.000. The balance always equals the sum. A repeated cause returns the existing movement, and a guarded debit that would go below 0 is refused.

- [X] T006 [P] [US1] Create `src/infrastructure/persistence/mongo/walletMovementRepository.ts` (collection `walletMovements`):
  - `movementToDocument` / `movementFromDocument`;
  - `ensureIndexes()` with `causeKey_unique` and `wallet_sequence_unique` (`{ walletId: 1, sequence: -1 }`, unique);
  - `findByCauseKey`;
  - `listForWallet(walletId, skip, limit)`, sorted `{ sequence: -1 }`.

  No update or delete methods. Add `tests/unit/infrastructure/persistence/mongo/walletMovementRepository.test.ts` (round trip with Dates, both index definitions, filter/sort/skip/limit).
- [X] T007 [P] [US1] Create `src/infrastructure/persistence/mongo/walletRepository.ts` (collection `wallets`, `_id` = goalkeeperId), with the mapping and `findByGoalkeeperId`. Add `tests/unit/infrastructure/persistence/mongo/walletRepository.test.ts`.
- [X] T008 [US1] Create `src/infrastructure/persistence/mongo/walletStore.ts`, implementing `IWalletStore.append(draft)` exactly as in plan.md "Implementation notes":
  - `withTransaction` with the 008 options;
  - wallet upsert with `$setOnInsert`;
  - a guarded `findOneAndUpdate` (with `balance: { $gte: -amount }` only when `isGuardedDebit`) `$inc`-ing `balance` and `lastSequence`, with `returnDocument: 'after'`;
  - null → `{ kind: 'insufficient_funds', balance }` (read the current balance) without inserting;
  - otherwise `insertOne` of the movement with `sequence = lastSequence` and `balanceAfter = balance`.

  A duplicate key with `keyPattern.causeKey` → re-read via `findByCauseKey` → `{ kind: 'duplicate', movement }`. Any other error rethrows. Always call `endSession()`.

  Also export `appendMovementInSession(db, session, draft, now)`, containing the three steps, so later stores can compose it into their own transactions (research §10). Add `tests/unit/infrastructure/persistence/mongo/walletStore.test.ts`:
  - `{ session }` on every operation;
  - the upsert document;
  - the guard is present for a commission charge and a negative adjustment, and absent for a penalty and for credits;
  - `insufficient_funds` inserts nothing;
  - the duplicate classification;
  - the rethrow;
  - `endSession`.
- [X] T009 [P] [US1] Create the fakes:
  - `tests/fakes/fakeWalletStore.ts`: an in-memory `IWalletStore` that applies the same rules (lazy wallet, guarded debits, consecutive sequence, `balanceAfter`, `causeKey` uniqueness → `duplicate`), exposing `wallets()` and `movements()`;
  - `tests/fakes/fakeWalletRepository.ts`, implementing `IWalletRepository` and `IWalletMovementRepository` over the fake store's state.
- [X] T010 [US1] Create `src/application/features/wallet/common/walletLedger.ts`, class `WalletLedger(store: IWalletStore, movements: IWalletMovementRepository, idGenerator, clock)`. Methods:
  - `chargeCommission({ goalkeeperId, currency, invoicing, bookingId, requestId, amount })` → a draft of type `commission_charge`, amount `−amount`, causeKey `commission:<bookingId>`, actor system;
  - `refundCommission({ goalkeeperId, currency, invoicing, bookingId, requestId, cancellation })` → looks up `commission:<bookingId>`; if missing → `{ kind: 'nothing_to_refund' }`; else a `commission_refund` draft of `−charge.amount` with causeKey `commission_refund:<bookingId>` and the cancellation;
  - `applyPenalty({ …, penaltyEventId, amount, references })` → `penalty`, `−amount`, causeKey `penalty:<penaltyEventId>`;
  - `reversePenalty({ …, penaltyMovementId, actor })` → reads that penalty and creates a `penalty_reversal` of `+|penalty.amount|` with causeKey `penalty_reversal:<penaltyMovementId>`;
  - `creditTopUp({ …, topUpId, amount })` → `top_up`, causeKey `top_up:<topUpId>`;
  - `adjust({ …, adminUserId, amount, reason, operationKey })` → `admin_adjustment`, causeKey `adjustment:<operationKey>`, actor admin.

  Every method first calls `movements.findByCauseKey` (the fast path → `duplicate`), then `store.append`. Add `tests/unit/application/features/wallet/walletLedger.test.ts` covering the spec US1 scenarios:
  - the sequence of balances 20.000 → 13.000 → 20.000;
  - a repeated cause → `duplicate` without a second movement (SC-002);
  - the refund carries the cancellation details and the **charged** amount even if a different amount is passed later (FR-011);
  - `nothing_to_refund`;
  - a penalty takes the balance negative;
  - a charge and a negative adjustment below 0 → `insufficient_funds` (FR-008, SC-003);
  - the invoicing snapshot is copied onto every movement;
  - the balance always equals the sum of the movements (SC-001, sequential).

**Checkpoint**: the ledger is proven with fakes and the Mongo store is unit-tested.

---

## Phase 4: User Story 3 - Commission per country, anchor city or zone (Priority: P1)

**Goal**: Resolve a zone's commission as zone → anchor city → country, or null.

**Independent Test**: With Colombia 7.000, Medellín 8.000 and Laureles 9.000: Laureles → 9.000, another Medellín zone → 8.000, a Cali zone → 7.000, an unconfigured country → null.

- [X] T011 [P] [US3] Create `src/domain/wallet/commissionSetting.ts`: class `CommissionSetting extends Entity<string> { scope: 'country' | 'city' | 'zone'; refId; amount }`. Validate like `src/domain/pricing/rentalRate.ts`: a known scope, a non-empty `refId`, and `amount` an integer > 0, throwing `InvalidConfigurationError`. Add `tests/unit/domain/wallet/commissionSetting.test.ts`.
- [X] T012 [P] [US3] Create `src/infrastructure/persistence/mongo/commissionSettingRepository.ts` (collection `commissionSettings`, index `{ scope: 1, refId: 1 }` unique, name `scope_refId`). `findFor({ zoneIds, cityIds, countryIds })` does one `find` with `$or` over the three scopes using `$in`; empty lists are omitted. Add `tests/unit/infrastructure/persistence/mongo/commissionSettingRepository.test.ts`, and `tests/fakes/fakeCommissionSettingRepository.ts` (`seed`, `findFor`).
- [X] T013 [US3] Create `src/application/features/wallet/common/commissionResolver.ts`, class `CommissionResolver(settings, zoneRepository, cityRepository, regionRepository)` implementing `ICommissionResolver.resolveForZones(zoneIds)`:
  1. load the zones (`getManyByIds`);
  2. map their anchor cities to countries via cities (`getByIds`) → regions (`getByIds`) → `countryId`;
  3. one `settings.findFor` call;
  4. for each zone: the zone value ?? the city value ?? the country value ?? null. A missing zone → null.

  Add `tests/unit/application/features/wallet/commissionResolver.test.ts`, with spec US3 scenarios 1–4 and "several zones resolved with a single settings read".

---

## Phase 5: User Story 4 - Only matches the goalkeeper can pay for (Priority: P1)

**Goal**: The reusable funds decision.

**Independent Test**: With zones at 7.000 and 9.000: balance 6.000 → none; 8.000 → only the 7.000 zone; 9.000 → both; −2.000 → none; exactly 7.000 → the 7.000 zone.

- [X] T014 [P] [US4] Create `src/domain/wallet/fundsPolicy.ts` with `offersStatus(balance, zoneCommissions)` and `canAfford(balance, commission)`, exactly as in research.md §5, with doc comments citing FR-012. Add `tests/unit/domain/wallet/fundsPolicy.test.ts` with the full table:
  - below, equal to and above each commission;
  - negative balance;
  - every zone unconfigured → `canSeeOffers: false` and `lowestCommission: null`;
  - unconfigured zones ignored for the minimum;
  - `missingAmount` values;
  - `canAfford(x, null)` → false (SC-004).
- [X] T015 [US4] Verify `npx tsc --noEmit -p .` is green now that `commissionSetting.ts` exists (it was referenced by the T004 ports). Fix any typing left open.

---

## Phase 6: User Story 2 - The goalkeeper sees balance and history (Priority: P1)

**Goal**: `GET /api/goalkeepers/me/wallet` and `GET /api/goalkeepers/me/wallet/movements`.

**Independent Test**: Seed +20.000 and −7.000. The wallet shows 13.000 COP with offers visible (7.000 zone), and the movements come newest first. A client without a goalkeeper profile gets 404.

- [X] T016 [P] [US2] Create `src/application/features/wallet/common/walletResponses.ts` with:
  - `WalletViewResponse { balance, currency, offers: { canSeeOffers, lowestCommission, missingAmount }, movementCount }`;
  - `MovementItemResponse` (the goalkeeper fields of contracts/goalkeeper-wallet.md);
  - `AdminMovementItemResponse extends MovementItemResponse { actor, causeKey, invoicing }`;
  - the mappers `toMovementItem(movement)` and `toAdminMovementItem(movement)`.
- [X] T017 [US2] Create `src/application/features/wallet/queries/getGoalkeeperWallet/getGoalkeeperWalletQuery.ts` and `…QueryHandler.ts`. The handler runs `resolveGoalkeeperWalletContext`, then reads the wallet (missing → `Wallet.empty`), then `commissionResolver.resolveForZones(profile.zoneIds)`, then `offersStatus`. The result union is:
  - `{ outcome: 'success'; wallet: WalletViewResponse; unconfiguredZoneIds: string[] }`;
  - `{ outcome: 'not_a_goalkeeper' }`;
  - `{ outcome: 'wallet_not_configured'; cityId }`.

  Add `tests/unit/application/features/wallet/getGoalkeeperWalletQueryHandler.test.ts`: spec US2 scenarios 1 and 3, offers visible and not visible with `missingAmount`, unconfigured zone ids reported, not a goalkeeper.
- [X] T018 [US2] Create `src/application/features/wallet/queries/listWalletMovements/listWalletMovementsQuery.ts` and `…QueryHandler.ts` with `(goalkeeperId, page, pageSize, audience: 'goalkeeper' | 'admin')`:
  - profile check → `not_a_goalkeeper`;
  - `totalItems = wallet?.lastSequence ?? 0`;
  - `listForWallet(goalkeeperId, (page−1)·pageSize, pageSize)`;
  - items mapped per audience.

  Result: `{ outcome: 'success', items, page, pageSize, totalItems, totalPages }` or `not_a_goalkeeper`. Add `tests/unit/application/features/wallet/listWalletMovementsQueryHandler.test.ts` (45 movements → 20/20/5 newest first; the admin audience includes actor, causeKey and invoicing; the goalkeeper audience does not).
- [X] T019 [US2] Add `GET /me/wallet` and `GET /me/wallet/movements` to `src/controllers/goalkeeperController.ts`, under its existing `/me` chain:
  - the movements route parses `req.query` with the existing `listClientBookingsRequestSchema` (`src/controllers/requests/goalkeeperRequests/listClientBookingsRequest.ts`, the same page/pageSize rules), failing with `400 validation_failed` + `zodFieldErrors`;
  - map `not_a_goalkeeper` → `404 goalkeeper_not_found` and `wallet_not_configured` → `422 wallet_not_configured`, logging `warn` with the `cityId`;
  - when `unconfiguredZoneIds` is non-empty, log `logger.warn({ outcome: 'commission_not_configured', zoneIds }, …)` and do not serialize it.

  Register both query handlers in `src/infrastructure/di.ts`: construct the wallet and movement repositories, the commission setting repository with `await ensureIndexes()` for each, and `CommissionResolver`. Register them in `tests/http/testAppFactory.ts` with fakes too, exposing `walletStore` (the fake), `commissionSettingRepository` and `walletLedger` on `TestAppContext` so HTTP tests can seed movements through the ledger.
- [X] T020 [US2] Create `tests/http/controllers/goalkeeperWallet.test.ts`:
  - an active goalkeeper (create the profile the way `goalkeeperActivate.test.ts` does) with the seeded Colombia commission of 7.000 and movements seeded via `walletLedger.adjust` / `chargeCommission` → `200` with the contract body;
  - movements newest first, with the goalkeeper fields only;
  - pagination 400s;
  - a client without a profile → `404 goalkeeper_not_found`;
  - 401 without a token.

---

## Phase 7: User Story 5 - Admin inspection and manual adjustments (Priority: P2)

**Goal**: The `/api/admin` router: read wallets and movements, and record adjustments.

**Independent Test**: As admin, credit +50.000 ("Saldo inicial de pruebas") → 201; the same `operationKey` → 200 with the same movement; a debit below 0 → 409; a missing reason → 400; a non-admin → 403.

- [X] T021 [P] [US5] Create `src/controllers/requests/wallet/recordWalletAdjustmentRequest.ts`, a zod schema:
  - `amount`: integer ≠ 0;
  - `reason`: a trimmed string of 3–500 characters;
  - `operationKey`: a string that passes `uuid.validate`, with the message "must be a UUID".
- [X] T022 [US5] Create `src/application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommand.ts` and `…CommandHandler.ts` with `(adminUserId, goalkeeperId, amount, reason, operationKey)`:
  - `resolveGoalkeeperWalletContext` → `not_a_goalkeeper` / `wallet_not_configured`;
  - `walletLedger.adjust(...)` → `recorded` (with the movement and the balance after it), `replayed` (duplicate: the original movement plus the current balance) or `insufficient_funds` (with the balance).

  Add `tests/unit/application/features/wallet/recordWalletAdjustmentCommandHandler.test.ts` (spec US5 scenarios 1–4 and 6).
- [X] T023 [US5] Create `src/controllers/adminController.ts` with `createAdminController(deps)`: `router.use(requireAuth(deps.verifyAccessToken), requireAdmin())`, then:
  - `GET /goalkeepers/:userId/wallet` (`GetGoalkeeperWalletQuery`, with `goalkeeperId` added to the body);
  - `GET /goalkeepers/:userId/wallet/movements` (`ListWalletMovementsQuery`, audience `admin`);
  - `POST /goalkeepers/:userId/wallet/adjustments` (the T021 schema → the command with `adminUserId = claims.sub`): `recorded` → 201; `replayed` → 200; `insufficient_funds` → `409 { error: 'insufficient_funds', balance }`; `not_a_goalkeeper` → `404 goalkeeper_not_found`; `wallet_not_configured` → 422.

  Mount it in `src/app.ts` as `app.use('/api/admin', createAdminController(deps))`. Register the command handler in `src/infrastructure/di.ts` (with a `WalletLedger` over `MongoWalletStore`) and in `tests/http/testAppFactory.ts`.
- [X] T024 [US5] Create `tests/http/controllers/adminWallet.test.ts`, with an admin token obtained as in `clientsGetProfile.test.ts` (`User.createFromExternalIdentity({ …, isAdmin: true })` + the `admin-web` exchange):
  - credit → 201 with the contract body;
  - replay → 200 with the same `movementId`, and only 1 movement stored;
  - a debit below 0 → 409 with the balance;
  - invalid bodies → 400 naming the fields;
  - a non-admin (client) token → 403;
  - an unknown user → 404;
  - admin reads of the wallet and movements (the admin fields are present).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T025 [P] Document the 5 endpoints in `src/infrastructure/openapi/openapiSpec.ts`: the schemas `WalletViewResponse`, `WalletMovementItem`, `AdminWalletMovementItem`, `WalletMovementsPage` and `RecordWalletAdjustmentRequest`; a new `Admin` tag; security; error responses per the two contracts.
- [X] T026 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 consecutive runs, 0 failures) and `npm run test:architecture`. Fix any failure.
- [ ] T027 Manual (deferred to the end of the roadmap, like 010), per `specs/011-goalkeeper-wallet/quickstart.md`: §2 seed the Colombia commission (7.000 COP); §3 walk-through; §4 concurrency (SC-001, SC-002). Record the results.

---

## Dependencies & Execution Order

- **Phase 1** (T001) and **Phase 2** (T002–T005) → **US1** (T006–T010) → **US3** (T011–T013) → **US4** (T014–T015) → **US2** (T016–T020) → **US5** (T021–T024) → **Polish**.
- US3 (T011–T012) and US4 (T014) do not depend on US1 and may run in parallel with it. US2 needs US1, US3 and US4. US5 needs US1 and US2's routers (shared DI and test factory edits).

### Within stories
- T006, T007 → T008 (the store uses both mappings); T009 ∥ T008; T008 and T009 → T010.
- T011 → T012 → T013.
- T016 → T017, T018 → T019 → T020.
- T021 ∥ T022 → T023 → T024.

### Parallel opportunities
- T001 ∥ T002 ∥ T003.
- T006 ∥ T007 ∥ T009 ∥ T011 ∥ T014.
- T016 ∥ T021.

## Parallel Example: start of implementation

```bash
Task: "T001 requireAdmin"  &  Task: "T002 WalletMovement"  &  Task: "T003 Wallet"
Task: "T006 movement repository"  &  Task: "T007 wallet repository"  &  Task: "T011 CommissionSetting"  &  Task: "T014 fundsPolicy"
```

## Implementation Strategy

1. **Setup + Foundational + US1** → the MVP: a trustworthy ledger, proven with fakes and against the mocked driver.
2. **US3 + US4** → the commission and the funds rules (pure; unblock 012).
3. **US2** → the goalkeeper can see their wallet.
4. **US5** → admins can credit (enables testing 012 before the gateway).
5. **Polish** → OpenAPI, repeated suite runs; the manual checks are deferred to the end of the roadmap.

## Notes

- `WalletLedger` is the only writer. No task adds a way to edit or delete a movement.
- `appendMovementInSession` is exported for 012 (acceptance) to charge the commission inside its own transaction.
- Commit at each checkpoint when the user asks.
