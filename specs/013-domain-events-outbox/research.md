# Research: Reliable Domain Events and Scheduled Jobs

**Feature**: `013-domain-events-outbox` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The platform choices come from the roadmap (`_temp_plan.md` §4.2–4.3): Pub/Sub, Cloud Scheduler, OIDC and Cloud Run. The roadmap's open decisions are resolved here:
- one topic or several (§4);
- outbox retention (§3);
- local mode (§8);
- how the sweep claims work (§6, §7).

---

## §1 Events are data, recorded in the change's transaction

**Decision**: A domain event is a plain, versioned record:

```ts
{ id, type, version: 1, occurredAt, bookingId, requestId, payload }
```

- `id`: uuid v7, which is also the Pub/Sub deduplication key for consumers.
- `type`: `'booking.created' | 'goalkeeper.assigned'`.

The events are built by pure factories in the domain (`src/domain/events/`) and inserted into the `outbox` collection **inside the same `withTransaction`** as the change:
- `MongoQuoteConfirmationStore`: the `build` callback now also returns the events, one per booking;
- `MongoBookingAcceptanceStore`: a new `event(booking)` callback, inserted after the charge.

Both use one shared infrastructure function, `appendEventsInSession(db, session, events, now)`, the same pattern as 011's `appendMovementInSession`.

**Rationale**:
- The change and its event commit or abort together (FR-002).
- Replays and refusals never reach the insert, so they record nothing (FR-004).
- Later features reuse the same function (FR-005).

**Alternatives considered**:
- Publishing directly after the commit, without an outbox: an event is lost when the process stops in between.
- MongoDB change streams: they need a process that is always awake, which Cloud Run with `minInstances: 0` doesn't give.

## §2 Publication before the response, bounded to 2 seconds

**Decision**: After the store commits, the command handler, and only on the `created` or `accepted` paths, calls the application port `IEventRelay.relay(events)`. The relay:
1. publishes each event through `IEventPublisher`;
2. marks the published ones with `IOutboxStore.markPublished(ids, now)`.

The whole relay runs under `Promise.race` with a 2-second timer (clarification 3):
- on timeout or on a publisher error, it logs `event_publish_failed` / `event_publish_timeout` with the ids and returns normally;
- the handler never fails because of it (FR-007, FR-007a).

The events are inserted with `claimedUntil = now + 30 s`. This gives the in-request relay a short lease: the sweep ignores these events for 30 seconds, then takes them over if the request died.

**Rationale**:
- On Cloud Run, CPU is throttled after the response. Work "after responding" is unreliable, so the publication must finish before `res.json`.
- The 30-second lease avoids the common double publication (request + sweep) without any coordination.

**Alternatives considered**: `setImmediate` after the response, rejected for the reason above. Publishing inside the transaction, rejected: an external call cannot be rolled back.

## §3 Outbox document and retention

**Decision**: Collection `outbox`, with fields:
- `_id` (event id), `type`, `version`, `occurredAt`, `bookingId`, `requestId`, `payload`;
- `status: 'pending' | 'published'`, `attempts`, `claimedUntil`, `publishedAt`, `createdAt`.

Indexes:
- `status_claimed_created` `{ status: 1, claimedUntil: 1, createdAt: 1 }`, used by the sweep claim;
- a **TTL index on `publishedAt`** with `expireAfterSeconds = 7 days` (FR-010).

MongoDB's TTL monitor ignores documents where the field is missing or null. Pending events have no `publishedAt`, so they are never removed.

**Alternatives considered**: A cleanup job in the sweep, which is more code for the same result. A capped collection, which can drop pending events.

## §4 One topic for every event type

**Decision**: One topic, `booking-events`. Each message has:
- `data` = the JSON of the event;
- attributes `{ type, eventId, version }`.

The dead-letter topic is `booking-events-dlq`.

**Rationale**:
- With one Cloud Run service and a handful of low-volume event types, per-type topics only multiply the infrastructure.
- Subscriptions can still filter by the `type` attribute (Pub/Sub subscription filters) if a future consumer needs isolation.

**Alternatives considered**: One topic per type, which gives more topics, subscriptions and dead-letter wiring for no present benefit.

## §5 Delivery: one push subscription, one endpoint, fan-out in the mediator

**Decision**: One push subscription, `booking-events-api`, targets `POST /internal/events`, with:
- OIDC push authentication (§9);
- `ackDeadline` 30 s, and retry backoff from 10 s to 600 s;
- dead-letter to `booking-events-dlq` after `maxDeliveryAttempts = 5`.

The endpoint:
1. decodes the push envelope (`message.data` in base64, `message.attributes`);
2. validates the event with a zod schema per type and version;
3. calls `mediator.publish(event)`, which runs every handler subscribed to that type.

The endpoint answers:
- `204` when every handler succeeds or reports a repeat;
- `204` for a malformed message or an unknown type, logged as `event_rejected` (FR-015);
- `500` when a handler fails, so Pub/Sub retries it (FR-013).

On a retry, handlers that already succeeded skip it thanks to idempotency (§7).

**Rationale**:
- Fan-out in the mediator (FR-017) makes the production path and the local path (§8) identical.
- One subscription keeps the infrastructure small.

**Alternatives considered**: One subscription and endpoint per consumer. It gives better isolation: one failing consumer doesn't make the others' deliveries retry, and each has its own dead-letter count. Revisit when a consumer is slow or flaky, for example FCM sending in 015. It can then be done by adding a subscription that points to `/internal/events?consumer=<name>`, which runs only that handler. The endpoint supports this parameter from the start.

## §6 Mediator: `publish` fans out to every subscribed handler

**Decision**: The mediator gains notifications:
- the types `INotification { readonly type: string }` and `INotificationHandler<T> { readonly name: string; handle(n: T): Promise<void> }`;
- `Mediator.subscribe(type, handler)` and `registerSubscribers(...)`;
- `publish(notification, { only?: string })`.

`publish` runs the handlers of that type **sequentially**. It collects the failures and throws an `EventHandlersFailedError` listing the failed handler names. A type with no handler is a no-op.

A second interface, `IPublisher`, is added next to `ISender`.

**Rationale**:
- Handlers are few. Running them sequentially keeps the logs readable and avoids concurrent writes to the same documents.
- Keying by the `type` string means events stay plain data from the domain, not classes, which the envelope decoding needs anyway.

**Alternatives considered**: `Promise.allSettled`, which gives parallelism nobody needs yet. Keying by class, as commands do, which would force a class per event and a type→class map at the edge anyway.

## §7 Consumer idempotency

**Decision**: Collection `processedEvents`:
- `_id = '<consumer>:<eventId>'`, plus `consumer`, `eventId`, `processedAt`;
- a TTL of 30 days on `processedAt`. This is longer than Pub/Sub's maximum retention of 7 days, so no redelivery can outlive the marker.

The application helper `runOnce(store, consumer, eventId, effect)`:
1. `store.has(key)` → true: return `'duplicate'`;
2. otherwise run `effect()`;
3. `store.markProcessed(key)`, ignoring a duplicate-key error from a concurrent delivery;
4. return `'processed'`.

Rule for consumers (documented in the helper): **the effect itself must be safe to repeat.** Two concurrent deliveries can both pass step 1. The effect must therefore be keyed by the event id, like 011's `causeKey`, or be naturally idempotent. The marker only saves work.

The delivery-log consumer's effect is `insertOne({ _id: eventId, … })`, with a duplicate key treated as success: naturally idempotent.

**Rationale**: At-least-once delivery plus an idempotent effect gives exactly-once effects (SC-003), even under 20 simultaneous deliveries.

**Alternatives considered**: A marker and effect in one transaction, which only works when the effect is a Mongo write. It stays available for consumers that need it, but not as the default.

## §8 Local mode: in-process publisher plus a local sweep timer

**Decision**: `EVENTS_MODE=local`, the default when the variable is unset:
- the publisher is `InProcessEventPublisher`, which calls `mediator.publish(event)` directly. The consumers, `runOnce` and the collections are all the same as in production;
- `server.ts` starts a `setInterval` of 60 s that sends `RunSweepCommand`, standing in for Cloud Scheduler. The timer is `unref()`'d and cleared on shutdown.

`EVENTS_MODE=pubsub` requires `GCP_PROJECT_ID` and `EVENTS_TOPIC`, and uses the Pub/Sub publisher. There is no timer: Cloud Scheduler calls `/internal/sweep`.

At startup, `NODE_ENV=production` with `EVENTS_MODE=local` logs a warning.

**Rationale**:
- No emulator to install. Developers need nothing extra (SC-009).
- A consumer failure in local mode is a publication failure: the event stays pending and the timer's sweep retries it. That is the same recovery path as production.

**Alternatives considered**: The Pub/Sub emulator, which is closer to production but needs Java/gcloud on every machine, and push to localhost is awkward. It is documented as optional for someone who wants to test the real client.

## §9 Pub/Sub publishing without a new dependency

**Decision**: `PubSubEventPublisher` calls the Pub/Sub REST API directly:
- `POST https://pubsub.googleapis.com/v1/projects/{project}/topics/{topic}:publish`;
- with `GoogleAuth` from the already-installed `google-auth-library` (Application Default Credentials: the Cloud Run service account in production, `gcloud auth application-default login` for someone testing locally);
- scope `https://www.googleapis.com/auth/pubsub`.

Messages are batched per relay: one HTTP call for the events of one operation. The `AbortSignal` of the 2-second timeout is passed to the request.

**Rationale**:
- It is one endpoint and one JSON shape, and keeps the "no new dependency" line of 007–012.
- Batching, flow control and the gRPC transport of `@google-cloud/pubsub` are unnecessary at this volume, which is a few events per booking.

**Alternatives considered**: `@google-cloud/pubsub`, the official client with more features and a heavy dependency tree. It is easy to switch to later, because it sits behind `IEventPublisher`.

## §10 Internal endpoints authenticated with Google OIDC

**Decision**: The middleware `requireGoogleOidc({ audience, allowedInvokers })` uses `OAuth2Client.verifyIdToken({ idToken, audience })` from `google-auth-library`. It then requires:
- `payload.email_verified === true`;
- `payload.email` to be in `allowedInvokers`, the service-account emails of the Pub/Sub push identity and the Cloud Scheduler identity.

The audience is `INTERNAL_OIDC_AUDIENCE`: the service's public URL, configured on the subscription and on the scheduler job.

On failure, it answers `401 { error: 'unauthenticated' }` and logs `internal_auth_rejected` with the reason, without the token. Nothing runs (FR-023, FR-024).

App JWTs are never accepted there, not even an administrator's. Internal routes are mounted on `/internal`, outside `/api`, and are absent from the OpenAPI document (FR-025).

In local mode, the internal endpoints still exist and still require OIDC. The local timer and the in-process publisher bypass HTTP entirely, so nothing needs to be opened up.

**Rationale**: OIDC is how both Pub/Sub push and Cloud Scheduler authenticate. Pinning audience plus invoker emails stops tokens minted for other services or identities.

**Alternatives considered**: A shared secret in the URL or a header, which is weaker, leaks in logs and needs rotation. Relying on Cloud Run IAM "require authentication", which isn't available: the service must stay public for the mobile app.

## §11 The sweep claims events and jobs so overlapping sweeps don't double up

**Decision**: `RunSweepCommand` (application):
1. **Events**: repeatedly `IOutboxStore.claimNext(now, leaseSeconds = 60)`, up to 200 per sweep, oldest first. The claim is a `findOneAndUpdate({ status: 'pending', claimedUntil: { $lte: now } }, { $set: { claimedUntil: now + 60 s }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 } })`. The claimed batch is published in groups, and the published ones are marked. The claim is atomic per document, so two sweeps never hold the same event (SC-004).
2. **Warning**: `IOutboxStore.pendingStats(now)` returns the count and the oldest age. It logs `events_pending_too_long` when the oldest is older than 5 minutes (FR-009).
3. **Jobs**: for each registered `IScheduledJob { name; leaseSeconds; run(now) }`:
   - acquire `IJobLockStore.tryAcquire(name, now, lease)`, an upsert on `jobLocks` with `_id = name` and the condition `lockedUntil <= now`, where a duplicate-key error means "held";
   - run the job;
   - release the lock.

   Each job runs in its own try/catch (FR-020). A held lock reports `skipped`.
4. It returns `{ published, stillPending, oldestPendingSeconds, jobs: [{ name, outcome, detail }] }` (FR-022).

**Rationale**:
- Leases, not flags: a crashed sweep never leaves an event or a job stuck. The lease expires, and the next sweep takes over.
- Jobs are written to be repeatable, as the spec's edge case requires, so a lease expiring mid-run at worst repeats safe work.

**Alternatives considered**: One global sweep lock, which is simpler but lets one slow job block event publication for everybody. Distributed locks in Redis, rejected by the roadmap.

## §12 What each event carries

| Type | Producer | `payload` |
|---|---|---|
| `booking.created` | confirmation (010) | `clientId`, `zoneId`, `startsAt`, `commission`, `currency`, `goalkeeperCount` |
| `goalkeeper.assigned` | acceptance (012) | `goalkeeperId`, `clientId`, `zoneId`, `startsAt`, `commission` |

Both events also carry `bookingId` and `requestId` at the top level. Consumers read anything else they need, following the roadmap rule: small payload, ids first.
