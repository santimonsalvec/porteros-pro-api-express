---

description: "Task list for Reliable Domain Events and Scheduled Jobs"
---

# Tasks: Reliable Domain Events and Scheduled Jobs

**Input**: Design documents from `/specs/013-domain-events-outbox/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/internal-endpoints.md, quickstart.md

**Tests**: Included, per the repository convention:
- hand-written fakes plus `FixedClock`;
- stores tested against `tests/fakes/fakeMongoCollection.ts` plus a mocked `withTransaction`;
- HTTP tests with **`await buildTestApp()`**;
- **no real Pub/Sub, no real Google token verification** (FR-028);
- real delivery and concurrency are manual checks (quickstart §4).

**Organization**:
- Phase 2 builds the generic pieces: event type and factories, mediator `publish`, ports, fakes, the Mongo outbox, the relay and the envelope parsing.
- The stories then wire them:
  - US1: events inside the confirmation and acceptance transactions;
  - US2: publish, then republish from the sweep;
  - US3: idempotent consumers and the push endpoint;
  - US5: OIDC (P1, done before US4);
  - US4: scheduled jobs;
  - US6: local timer and cloud guide.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no unmet dependency)
- **[Story]**: US1–US6 (spec.md); Setup, Foundational and Polish tasks carry no label

---

## Phase 1: Setup

- [X] T001 Extend `src/infrastructure/config.ts`:
  - `config.events = { mode: optionalEnv('EVENTS_MODE', 'local') as 'local' | 'pubsub', gcpProjectId: () => requireEnv('GCP_PROJECT_ID'), topic: optionalEnv('EVENTS_TOPIC', 'booking-events'), relayTimeoutMs: 2000, pendingWarningMinutes: 5, sweepBatchLimit: 200 }`;
  - `config.internalAuth = { audience: () => requireEnv('INTERNAL_OIDC_AUDIENCE'), allowedInvokers: optionalEnv('INTERNAL_ALLOWED_INVOKERS', '').split(',').map(s => s.trim()).filter(Boolean) }`.

  Add a startup validator, `assertEventsConfig()`: in `pubsub` mode, `GCP_PROJECT_ID`, `INTERNAL_OIDC_AUDIENCE` and at least one invoker are required. It throws a clear error when one is missing.

---

## Phase 2: Foundational (generic event machinery)

**⚠️ CRITICAL**: blocks every story. It must end green (`npx tsc --noEmit -p .`, `npm test`).

### Domain

- [X] T002 [P] Create `src/domain/events/domainEvent.ts`:
  - `type DomainEventType = 'booking.created' | 'goalkeeper.assigned'`;
  - `interface DomainEvent<TType, TPayload> { id; type; version: 1; occurredAt: Date; bookingId; requestId; payload }`.

  Create `src/domain/events/bookingEvents.ts` with the pure factories:
  - `bookingCreated(id, booking, request, at)`: payload `{ clientId, zoneId, startsAt, commission, currency, goalkeeperCount }`;
  - `goalkeeperAssigned(id, booking, at)`: payload `{ goalkeeperId, clientId, zoneId, startsAt, commission }`. It throws if the booking is not assigned.

  Add `tests/unit/domain/events/bookingEvents.test.ts`.

### Mediator

- [X] T003 [P] Extend `src/application/common/mediator/`:
  - `types.ts`: add `INotification { readonly type: string }`, `INotificationHandler<T> { readonly name: string; handle(n: T): Promise<void> }` and `IPublisher { publish(n, options?: { only?: string }): Promise<void> }`;
  - `errors.ts`: add `EventHandlersFailedError(type, failedHandlerNames, causes)`;
  - `mediator.ts`: `Mediator` also implements `IPublisher`, with:
    - `subscribe(type, handler)`, which rejects a duplicate handler name per type;
    - `publish`, which runs that type's handlers sequentially, filtered by `only`, collects the failures and throws `EventHandlersFailedError` if any failed. No handler means a no-op;
    - `registerSubscribers(mediator, [{ type, handler }])`.

  Extend `tests/unit/application/mediator/mediator.test.ts`:
  - fan-out to 2 handlers;
  - one failing handler still lets the other run, and the error names it;
  - `only`;
  - unknown type;
  - duplicate name.

### Ports, fakes, outbox, relay, parsing

- [X] T004 Create `src/application/features/events/common/ports.ts` with every interface in data-model.md "Application ports": `IEventPublisher`, `IOutboxStore`, `IEventRelay`, `IProcessedEventStore`, `IScheduledJob`, `IJobLockStore`, `IEventDeliveryLog`.
- [X] T005 [P] Create the fakes in `tests/fakes/`:
  - `fakeEventPublisher.ts`: records the published batches; `failNextWith(error)`; `delayNextMs(ms)`, which honors the `AbortSignal`;
  - `fakeOutboxStore.ts`: an in-memory outbox with `append(events, now)` (status pending, `claimedUntil = now + 30 s`, `attempts: 0`), `markPublished`, `claimNext` (atomic in JS, leases, oldest first), `pendingStats`, `all()`;
  - `fakeProcessedEventStore.ts`;
  - `fakeJobLockStore.ts`, which honors leases;
  - `fakeEventDeliveryLog.ts`.
- [X] T006 [P] Create `src/infrastructure/persistence/mongo/outboxStore.ts`:
  - `OUTBOX_COLLECTION = 'outbox'`, with `eventToDocument` / `eventFromDocument` (versioned; dates kept as `Date`);
  - an exported `appendEventsInSession(db, session, events, now)`, which does an `insertMany` with `status: 'pending'`, `attempts: 0`, `claimedUntil: now + 30 s` and `createdAt: now`;
  - `MongoOutboxStore implements IOutboxStore`:
    - `markPublished`: `updateMany({ _id: { $in } }, { $set: { status: 'published', publishedAt } })`;
    - `claimNext`: a loop of `findOneAndUpdate({ status: 'pending', claimedUntil: { $lte: now } }, { $set: { claimedUntil: now + lease }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, returnDocument: 'after' })` up to `limit`;
    - `pendingStats`: a count plus the oldest `createdAt`;
    - `ensureIndexes()`: `status_claimed_created`, and `published_ttl` (`expireAfterSeconds: 604800`).

  Add `tests/unit/infrastructure/persistence/mongo/outboxStore.test.ts`, which checks the filters, updates, sort and indexes on a mocked collection.
- [X] T007 [P] Create `src/application/features/events/common/eventRelay.ts`: `EventRelay implements IEventRelay`, built with `(publisher, outbox, clock, logger-like { warn }, timeoutMs)`. `relay(events)`:
  - an empty list is a no-op;
  - an `AbortController` plus a timer of `timeoutMs`;
  - it runs `await Promise.race([publish(events, signal).then(() => outbox.markPublished(ids, clock.now())), timeout])`;
  - on an error it logs `event_publish_failed`, and on a timeout `event_publish_timeout`, each with `{ eventIds, types }`;
  - **it never throws**, and it clears the timer.

  Add `tests/unit/application/features/events/eventRelay.test.ts`, using `vi.useFakeTimers` for the timeout:
  - success marks the events published;
  - a failure leaves them pending and resolves;
  - a timeout after 2 s leaves them pending and resolves;
  - an empty list makes no calls.
- [X] T008 [P] Create `src/application/features/events/common/eventSchemas.ts`, with `parseEvent(json: unknown): DomainEvent | null`: zod schemas per `type` and `version` (ISO dates revived to `Date`; `null` for an unknown type, a wrong version or a bad shape). Also `decodePushEnvelope(body): { event: DomainEvent | null; messageId?: string }`, which base64-decodes `message.data`. Add `tests/unit/application/features/events/eventSchemas.test.ts` (both types, bad JSON, unknown type, bad base64, missing fields).

**Checkpoint**: tsc and `npm test` are green.

---

## Phase 3: User Story 1 - A relevant change and its event are never separated (Priority: P1) 🎯 MVP

**Goal**: The confirmation writes one `booking.created` per booking, and the acceptance writes one `goalkeeper.assigned`, each in the same transaction. Replays and refusals write none.

**Independent Test**:
- Confirm 2 goalkeepers: the outbox has 2 `booking.created` events.
- Replay: still 2.
- Make the store throw after the inserts: no bookings and no events.
- Accept: 1 `goalkeeper.assigned`. Accept again: still 1.

- [X] T009 [US1] Change the ports in `src/application/features/goalkeeperRequests/common/ports.ts`:
  - `IQuoteConfirmationStore.claimAndCreateRequest`'s `build` returns `{ request, bookings, events }`, and the `created` result carries `events`;
  - `IBookingAcceptanceStore.accept` args gain `event: (booking: Booking) => DomainEvent`, and the `accepted` result carries `event`.
- [X] T010 [US1] `src/infrastructure/persistence/mongo/quoteConfirmationStore.ts`: after `insertMany(bookings)`, call `await appendEventsInSession(this.db, session, created.events, now)` in the same `withTransaction`. `src/infrastructure/persistence/mongo/bookingAcceptanceStore.ts`: after the charge, build `event = args.event(booking)`, insert it with `appendEventsInSession`, and return it. Extend both store tests: the events are inserted with the session, and nothing is inserted on the refusal paths.
- [X] T011 [US1] Handlers:
  - `confirmBookingCommandHandler.ts`: in `build`, add `events: bookings.map(b => bookingCreated(this.idGenerator.newId(), b, request, now))`;
  - `acceptBookingCommandHandler.ts`: pass `event: (b) => goalkeeperAssigned(deps.idGenerator.newId(), b, now)`.

  Keep the result shapes the controllers see unchanged.
- [X] T012 [US1] Fakes:
  - `tests/fakes/fakeQuoteConfirmationStore.ts` and `tests/fakes/fakeBookingAcceptanceStore.ts` take an optional `FakeOutboxStore` and append the events only on success;
  - `tests/http/testAppFactory.ts` creates one `outboxStore = new FakeOutboxStore()` and exposes it on the test context.
- [X] T013 [P] [US1] Unit tests:
  - `confirmBookingCommandHandler.test.ts`: 2 goalkeepers give 2 `booking.created` events with the right ids and payload; a replay gives none; a refusal (expired, duplicate) gives none;
  - `acceptBookingCommandHandler.test.ts`: an acceptance gives 1 `goalkeeper.assigned` with the goalkeeper and commission; a replay or a refusal (taken, conflict, funds) gives none.
- [X] T014 [P] [US1] HTTP test `tests/http/controllers/domainEventsRecording.test.ts`:
  - a confirmation gives `context.outboxStore.all()` 2 `booking.created` events;
  - a replay leaves the count unchanged;
  - an acceptance adds 1 `goalkeeper.assigned`.

**Checkpoint**: events are recorded atomically. Nothing is published yet.

---

## Phase 4: User Story 2 - Every recorded event reaches its subscribers, even after a failure (Priority: P1)

**Goal**: The relay publishes before the response (with the 2 s cap), and the sweep republishes pending events.

**Independent Test**:
- With the publisher failing: the confirmation is 201, and the event is pending.
- Run the sweep: published once.
- Run it again: 0 published.

- [X] T015 [US2] Inject `IEventRelay` into `ConfirmBookingCommandHandler` (constructor parameter after `audit`) and into `AcceptBookingDependencies` (`relay`). On `created` and `accepted` only, `await this.relay.relay(events)` before returning. Update `di.ts`, `testAppFactory.ts` and the unit harnesses. The unit tests check that the relay is called with the events on success, and never on a replay or a refusal.
- [X] T016 [P] [US2] Create `src/infrastructure/events/pubSubEventPublisher.ts`: `PubSubEventPublisher implements IEventPublisher`, with `(projectId, topic)`.
  - It uses `new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/pubsub'] })`.
  - `publish(events, signal)` makes one `client.request({ url: https://pubsub.googleapis.com/v1/projects/${p}/topics/${t}:publish, method: 'POST', data: { messages }, signal })`. Each message has `data` = base64 of the JSON event and `attributes { type, eventId, version: '1' }`.
  - Batches go up to 100 messages per call. A non-2xx response throws.

  Add `tests/unit/infrastructure/events/pubSubEventPublisher.test.ts`, with `GoogleAuth` mocked via `vi.mock('google-auth-library')`: the URL, the base64 payload, the attributes, the batching at 100, a thrown error on non-2xx, and the signal passed through.
- [X] T017 [P] [US2] Create `src/infrastructure/events/inProcessEventPublisher.ts`: `InProcessEventPublisher implements IEventPublisher`, with `(publisher: IPublisher)`. It calls `await publisher.publish(event)` for each event and rejects on the first `EventHandlersFailedError`. Add a unit test.
- [X] T018 [US2] Create `src/application/features/events/commands/runSweep/runSweepCommand.ts` (`RunSweepCommand extends ICommand<SweepReport>`) and `runSweepCommandHandler.ts`, with deps `{ outbox, publisher, clock, logger, batchLimit, pendingWarningMinutes, jobs: IScheduledJob[], jobLocks }`. In this phase it does the **events part** only:
  1. `claimNext(now, 60, batchLimit)`;
  2. `publisher.publish(batch)` in chunks of 100;
  3. `markPublished` for each chunk that succeeded, logging the failures;
  4. `pendingStats`, with a warning `events_pending_too_long { count, oldestPendingSeconds }` when the oldest is older than 5 minutes;
  5. it returns `{ published, stillPending, oldestPendingSeconds, jobs: [] }`.

  Add `tests/unit/application/features/events/runSweepCommandHandler.test.ts` with `FakeOutboxStore`, `FakeEventPublisher` and `FixedClock`:
  - pending events past their lease are published and marked;
  - events inside the in-request 30 s lease are skipped;
  - a failed publish leaves them pending;
  - a second sweep publishes 0;
  - **two concurrent `handle()` calls over 100 pending events publish 100 in total**;
  - the warning threshold.
- [X] T019 [US2] Wire up `src/infrastructure/di.ts`:
  - `MongoOutboxStore` plus `ensureIndexes()`;
  - the publisher by `config.events.mode`: `PubSubEventPublisher` or `InProcessEventPublisher(mediator)`;
  - `EventRelay` with `config.events.relayTimeoutMs`;
  - register `RunSweepCommand` (with `jobs: []`);
  - call `assertEventsConfig()`;
  - log `events_mode` at startup, with a warning when `NODE_ENV=production` and the mode is `local`.

  `tests/http/testAppFactory.ts`: a real `EventRelay` with `FakeEventPublisher` and `FakeOutboxStore`, both exposed on the context.
- [X] T020 [P] [US2] HTTP test in `tests/http/controllers/domainEventsRecording.test.ts`:
  - with `context.eventPublisher.failNextWith(new Error('down'))`, the confirmation is `201` and the events are pending;
  - then `context.mediator.send(new RunSweepCommand())` publishes them;
  - without a failure, the events are published during the request (the publisher saw them before the response resolved).

**Checkpoint**: 0 lost events (SC-001, SC-006) with fakes.

---

## Phase 5: User Story 3 - Each event takes effect exactly once for each consumer (Priority: P1)

**Goal**: `POST /internal/events` decodes the event, fans it out, is idempotent, and answers 204, 204 (reject) or 500 (retry).

**Independent Test**: The same event delivered 5 times is logged once and answered `204` every time. A failing handler gets `500`. A malformed message gets `204` and is logged.

- [X] T021 [P] [US3] Create `src/application/features/events/common/runOnce.ts`: `runOnce(store, clock, consumer, eventId, effect): Promise<'processed' | 'duplicate'>` (research §7). Its doc comment states that the effect must be safe to repeat. Create `src/infrastructure/persistence/mongo/processedEventStore.ts` (`processedEvents`, `_id = consumer:eventId`, a duplicate key on mark is ignored, `ensureIndexes()` with a 30-day TTL). Add unit tests for both: first run, repeat, concurrent mark.
- [X] T022 [P] [US3] Create `src/application/features/events/handlers/logEventDelivery.ts`: `LogEventDeliveryHandler implements INotificationHandler<DomainEvent>`, `name = 'delivery-log'`. It uses `runOnce`, and its effect is `deliveryLog.record(event, now)`; it logs `event_delivered { eventId, type, outcome }`. Create `src/infrastructure/persistence/mongo/eventDeliveryLogRepository.ts` (`eventDeliveryLog`, `_id = eventId`, a duplicate counts as `'duplicate'`, a 30-day TTL). Unit tests: 5 deliveries give 1 record.
- [X] T023 [US3] Create `src/controllers/internalController.ts` with `createInternalController(deps)`:
  - `POST /events` runs `decodePushEnvelope(req.body)`:
    - `null` → log `event_rejected` and answer `204`;
    - otherwise `await deps.publisher.publish(event, { only: req.query.consumer })`, then `204`;
    - an `EventHandlersFailedError` → log `event_handlers_failed` and answer `500 { error: 'event_handlers_failed' }`.
  - Every route sits behind `requireInternalCaller(deps.verifyInternalCaller)`. That middleware is a stub in this phase (T026 makes it real): it reads `Authorization: Bearer`, calls the verifier, and answers `401 { error: 'unauthenticated' }` when the verifier returns false.

  Add `publisher: IPublisher` and `verifyInternalCaller: (token: string) => Promise<boolean>` to `src/appDependencies.ts`. Mount `/internal` in `src/app.ts` (not in the OpenAPI document). In `di.ts` and `testAppFactory.ts`, subscribe `LogEventDeliveryHandler` to both event types. The test factory's verifier accepts only the token `'test-internal-token'`.
- [X] T024 [P] [US3] HTTP test `tests/http/controllers/internalEvents.test.ts`, with a helper that builds a push envelope from an event:
  - one delivery gives `204` and 1 log record;
  - the same event 5 times gives `204` ×5 and 1 record;
  - 20 concurrent deliveries give 1 record;
  - a malformed body or an unknown type gives `204` and 0 records;
  - a subscribed handler that throws (a test-only handler) gives `500`;
  - `?consumer=delivery-log` runs only that handler.
- [X] T025 [P] [US3] HTTP test in `domainEventsRecording.test.ts`, local-mode end to end: in the test factory, use `InProcessEventPublisher(mediator)` in place of the fake for this case, by passing an option to `buildTestApp({ eventsMode: 'local' })`. Confirm a booking: the delivery log has its 2 events.

**Checkpoint**: exactly-once effects (SC-003) and delivery proof.

---

## Phase 6: User Story 5 - Only the platform can trigger the sweep and deliver events (Priority: P1)

**Goal**: A real OIDC verification on `/internal/*`.

**Independent Test**: No token, an app JWT, a wrong audience or an unknown invoker all give `401`, and nothing runs. A valid platform token passes.

- [X] T026 [US5] Create `src/infrastructure/events/googleOidcVerifier.ts`: `GoogleOidcVerifier`, with `(audience, allowedInvokers)`. `verify(token): Promise<{ ok: true; email } | { ok: false; reason }>` uses `OAuth2Client.verifyIdToken({ idToken, audience })` and requires `email_verified === true` and an `email` in `allowedInvokers`. It never throws. Wire `verifyInternalCaller` in `di.ts` from it, logging `internal_auth_rejected { reason }` without the token. Add `tests/unit/infrastructure/events/googleOidcVerifier.test.ts` with `OAuth2Client` mocked: a valid token, a wrong audience (library throws), unverified email, an unknown invoker, an empty token.
- [X] T027 [P] [US5] HTTP test `tests/http/controllers/internalAuth.test.ts`. For both `/internal/events` and `/internal/sweep`:
  - no header gives 401;
  - a valid app access token (from `signInAdmin`) gives 401;
  - a wrong token gives 401;
  - in each refused case, nothing is published and nothing is recorded.

  Also assert that `/openapi.json` has no `/internal` path.

**Checkpoint**: SC-005.

---

## Phase 7: User Story 4 - Time-based jobs run every minute, once (Priority: P2)

**Goal**: The sweep runs the registered jobs under lease locks, isolated from each other.

**Independent Test**: With two test jobs, one of which throws, both run and the report shows `succeeded` / `failed`. Two concurrent sweeps run each job once.

- [X] T028 [P] [US4] Create `src/infrastructure/persistence/mongo/jobLockStore.ts`: `MongoJobLockStore implements IJobLockStore` on `jobLocks`.
  - `tryAcquire`: `findOneAndUpdate({ _id: name, lockedUntil: { $lte: now } }, { $set: { lockedUntil: now + lease, lockedAt: now } }, { upsert: true })`. A duplicate-key error (11000) returns false.
  - `release`: `updateOne({ _id }, { $set: { lockedUntil: now } })`.

  Add a unit test on a mocked collection.
- [X] T029 [US4] Extend `runSweepCommandHandler.ts` with the jobs part, after the events. For each job:
  1. `tryAcquire(job.name, now, job.leaseSeconds)`, where false gives `skipped`;
  2. `try { detail = await job.run(now) → succeeded } catch → failed` and log `scheduled_job_failed { name, err }`;
  3. `finally release`.

  One job's failure never affects the others or the events part. Extend the unit tests:
  - two jobs, one throwing;
  - a held lock gives `skipped`;
  - two concurrent sweeps give 1 run per job;
  - a failing events part still runs the jobs.
- [X] T030 [US4] Add `POST /sweep` to `src/controllers/internalController.ts`: `200` with the `SweepReport`, or `500` only when the command throws. Wire `MongoJobLockStore` (plus `ensureIndexes`, if any) in `di.ts`, with `jobs: []`. HTTP test in `internalEvents.test.ts`: `POST /internal/sweep` with the test token gives `200 { published, stillPending, oldestPendingSeconds, jobs: [] }` and publishes pending events.

**Checkpoint**: SC-004. The mechanism is ready for 015/016.

---

## Phase 8: User Story 6 - The team can set up the cloud resources and work locally (Priority: P3)

- [X] T031 [US6] Create `src/infrastructure/events/localSweepTimer.ts`: `startLocalSweepTimer(sender, logger, intervalMs = 60000)` sends `RunSweepCommand` every interval, catches and logs errors, calls `unref()`, and returns `stop()`. `src/server.ts` starts it only when `config.events.mode === 'local'` and stops it on shutdown. Add a unit test with fake timers.
- [X] T032 [P] [US6] Create `docs/events-infrastructure.md` from quickstart §3. It must cover:
  - the topics, service accounts, IAM bindings, push subscription (OIDC, dead-letter, 5 attempts, backoff), DLQ review subscription and scheduler job;
  - the environment table;
  - how to read the dead letters (`gcloud pubsub subscriptions pull booking-events-dlq-review --auto-ack=false`);
  - the local mode;
  - the optional emulator note.

  Link it from `README.md`.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T033 [P] Add a "7. Eventos y barrido (spec 013)" section to `_temp_pruebas.md` (repository root, git-ignored, in Spanish), covering quickstart §2 (local) and §4 (cloud, after the guide is applied): steps, commands and expected results, in the file's existing format.
- [X] T034 Run `npx tsc --noEmit -p .`, `npm test`, `npm run lint`, `npm run test:http` (10 consecutive runs, 0 failures) and `npm run test:architecture` (no `mongodb` or `google-auth-library` imports in application or domain). Fix any failure.
- [ ] T035 Manual, deferred to the end of the roadmap (per `_temp_pruebas.md` §7): the local walk-through, the Google Cloud setup and the cloud checks SC-001–SC-005.

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (must end green) → **US1** → **US2** → **US3** → **US5** → **US4** → **US6** → **Polish**.
- US2 needs US1: the handlers must already build events. US3's endpoint needs US2's publisher split (`IPublisher` in `AppDependencies`). US5 replaces US3's stub verifier with the real one. US4 extends US2's sweep handler.

### Parallel opportunities
- Phase 2: T002 ∥ T003; then T004; then T005 ∥ T006 ∥ T007 ∥ T008.
- US1: T013 ∥ T014 after T009–T012.
- US2: T016 ∥ T017 ∥ T018; then T019; then T020.
- US3: T021 ∥ T022; then T023; then T024 ∥ T025.
- US4: T028 first, since T029 and T030 depend on it.

## Implementation Strategy

1. Phase 1–2: the generic machinery, green.
2. US1 + US2: the MVP. No lost events, with fakes.
3. US3 + US5: consumers and security. The chain is deployable.
4. US4: the job scheduler, ready for 015/016.
5. US6 + Polish: local timer, cloud guide, manual checks list.

## Notes

- Events are built in the **handlers**, never in the stores. The stores only insert what they are given, inside their transaction.
- The relay **never throws**. A handler's result never depends on publication.
- Consumers must keep their effect repeatable: `runOnce` only saves work, and the effect keyed by the event id is the real guarantee.
- No new npm dependency. Pub/Sub REST and OIDC both come from `google-auth-library`.
