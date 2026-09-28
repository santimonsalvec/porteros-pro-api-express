# Implementation Plan: Reliable Domain Events and Scheduled Jobs

**Branch**: `013-domain-events-outbox` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-domain-events-outbox/spec.md`

## Summary

Domain events are plain versioned records built by pure factories:
- `booking.created`: one per booking, at confirmation;
- `goalkeeper.assigned`: at acceptance.

They are inserted into an `outbox` collection **inside the same MongoDB transaction** as the change, through a shared `appendEventsInSession` (the 011 pattern).

On success only, the command handler then awaits an `EventRelay`. The relay:
- publishes through `IEventPublisher`;
- marks the events as published;
- is capped at 2 s and never throws.

Two publisher implementations:
- Pub/Sub, called over REST with the already-installed `google-auth-library`;
- in-process, for local mode: it calls `mediator.publish`.

The mediator gains `publish`, which fans out to several handlers keyed by event type.

Consumers receive events through **one** push subscription on `POST /internal/events`. Each consumer is idempotent (`runOnce` + `processedEvents`); a failing handler answers 500, which Pub/Sub retries, then dead-letters after 5 attempts.

`POST /internal/sweep`, called by Cloud Scheduler every minute (or by a 60 s timer in local mode):
- claims pending events with leases and republishes them;
- warns about events that stay pending too long;
- runs the registered jobs under per-job lease locks.

Both internal endpoints accept only Google OIDC tokens with a pinned audience and invoker emails. The example consumer is a delivery log.

Decisions: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: The existing stack only. Pub/Sub is called via its REST API with `google-auth-library` (already installed; research §9). OIDC verification uses the same library. No new dependency.
**Storage**: MongoDB (Atlas, transactions). New collections:
- `outbox`, with a TTL of 7 days on `publishedAt`;
- `processedEvents`, with a TTL of 30 days;
- `jobLocks`;
- `eventDeliveryLog`, with a TTL of 30 days.

The confirmation and acceptance transactions gain one insert each. See [data-model.md](./data-model.md).
**Testing**: Vitest tiers as in 008–012:
- a fake publisher, outbox store, processed-event store and lock store;
- HTTP tests of the internal endpoints with a fake OIDC verifier;
- no real Pub/Sub (FR-028).

Manual cloud checks are listed in [quickstart.md](./quickstart.md) §4.
**Target Platform**: Firebase App Hosting (Cloud Run, `maxInstances: 1`, `minInstances: 0`) plus Pub/Sub and Cloud Scheduler.
**Project Type**: Single backend web service.
**Performance Goals**:
- SC-002: events reach the delivery log within 5 s at p95;
- SC-007: publication adds ≤ 300 ms at p95 to confirmation and acceptance (one REST call per operation).

**Constraints**:
- the change and its event are all or nothing;
- no lost events;
- in-request publication is capped at 2 s;
- overlapping sweeps never double up;
- internal endpoints accept OIDC only.

**Scale/Scope**: A few events per booking; a sweep batch of ≤ 200 events; 0 jobs in this feature, and a handful later.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the template. The plan follows the 001–012 discipline:
- **Layering**: event factories live in the domain. The relay, the sweep, `runOnce` and the notification handlers live in the application, behind ports (`IEventPublisher`, `IOutboxStore`, `IProcessedEventStore`, `IJobLockStore`, `IEventDeliveryLog`). Mongo, the Pub/Sub REST client and OIDC live in infrastructure only. The architecture test keeps `mongodb` out of application and domain.
- **CQRS**: the sweep is a command; consumers are notification handlers.
- **Exhaustive outcome mapping** in the controllers.
- **Tests without real resources.**
- **No new dependency.**

Gate: **pass**.

*Post-Phase-1 re-check*: still passes.
- The only cross-cutting change touches two existing stores, which gain an extra insert in their transactions, and two handlers, which gain a relay call on their success paths.

## Project Structure

### Documentation (this feature)

```text
specs/013-domain-events-outbox/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/internal-endpoints.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── domain/events/
│   ├── domainEvent.ts                       # NEW: DomainEvent, DomainEventType
│   └── bookingEvents.ts                     # NEW: bookingCreated(), goalkeeperAssigned()
│
├── application/
│   ├── common/mediator/
│   │   ├── types.ts                         # MODIFIED: INotification, INotificationHandler, IPublisher
│   │   ├── mediator.ts                      # MODIFIED: subscribe(), publish() fan-out, registerSubscribers()
│   │   └── errors.ts                        # MODIFIED: EventHandlersFailedError
│   └── features/events/
│       ├── common/ports.ts                  # NEW: IEventPublisher, IOutboxStore, IEventRelay, IProcessedEventStore,
│       │                                    #      IScheduledJob, IJobLockStore, IEventDeliveryLog
│       ├── common/eventRelay.ts             # NEW: EventRelay (2 s cap, never throws)
│       ├── common/runOnce.ts                # NEW: consumer idempotency helper
│       ├── common/eventSchemas.ts           # NEW: zod parse of an event JSON by type and version (edge decoding)
│       ├── commands/runSweep/               # NEW: RunSweepCommand + handler (claim → publish → mark; warn; jobs)
│       └── handlers/logEventDelivery.ts     # NEW: delivery-log consumer (booking.created, goalkeeper.assigned)
│   └── features/goalkeeperRequests/
│       ├── common/ports.ts                  # MODIFIED: build returns events; accept takes event(); results carry events
│       ├── commands/confirmBooking/…Handler.ts   # MODIFIED: build events; relay on created
│       └── commands/acceptBooking/…Handler.ts    # MODIFIED: event factory; relay on accepted
│
├── infrastructure/
│   ├── events/
│   │   ├── pubSubEventPublisher.ts          # NEW: REST :publish via GoogleAuth, AbortSignal
│   │   ├── inProcessEventPublisher.ts       # NEW: local mode → mediator.publish
│   │   ├── localSweepTimer.ts               # NEW: 60 s interval → RunSweepCommand (local mode)
│   │   └── googleOidcVerifier.ts            # NEW: verifyIdToken + email_verified + allowed invokers
│   ├── persistence/mongo/
│   │   ├── outboxStore.ts                   # NEW: appendEventsInSession, markPublished, claimNext, pendingStats, indexes
│   │   ├── processedEventStore.ts           # NEW
│   │   ├── jobLockStore.ts                  # NEW
│   │   ├── eventDeliveryLogRepository.ts    # NEW
│   │   ├── quoteConfirmationStore.ts        # MODIFIED: insert events in the transaction
│   │   └── bookingAcceptanceStore.ts        # MODIFIED: insert event in the transaction
│   ├── config.ts                            # MODIFIED: events + internal auth settings
│   └── di.ts                                # MODIFIED: publisher by mode, relay, sweep, subscribers
├── controllers/internalController.ts        # NEW: POST /internal/events, POST /internal/sweep (+ requireGoogleOidc)
├── appDependencies.ts                       # MODIFIED: verifyInternalCaller, publisher (IPublisher)
├── app.ts                                   # MODIFIED: mount /internal
└── server.ts                                # MODIFIED: start/stop the local sweep timer

docs/events-infrastructure.md                # NEW: the Google Cloud guide (FR-026), from quickstart §3
tests/ … (unit: mediator publish, factories, relay, runOnce, sweep, delivery log, stores via collection mocks,
          confirm/accept handlers emit + relay; http: internal endpoints auth/ack/retry, confirm → delivery log)
```

**Structure Decision**:
- A new `events` application slice owns everything generic: relay, sweep, idempotency and the example consumer.
- The booking slices only build their events and call the relay.
- Infrastructure adds an `events/` folder for the publishers, the timer and the OIDC verifier.

## Implementation notes

- **Where events are built**: in the command handlers (application), using domain factories and `idGenerator`. They are passed to the stores, which only insert them. For confirmation, `build(quote)` returns `{ request, bookings, events }`. For acceptance, the handler passes `event: (booking) => goalkeeperAssigned(newId(), booking, now)`.
- **Relay placement**: `handle()` → store → on `created`/`accepted` → `await relay.relay(events)` → return. Replay paths never call the relay.
- **Relay timeout**: an `AbortController` plus a 2 s `setTimeout`. The signal goes to the publisher. On timeout the relay logs and returns; the events keep their 30 s lease, then the sweep takes over.
- **Local publisher failure semantics**: `InProcessEventPublisher.publish` awaits `mediator.publish`. A handler failure rejects, so the relay logs it and the event stays pending. The same thing happens in production when Pub/Sub rejects.
- **Envelope decoding**: `eventSchemas.parseEvent(json)` returns an event or `null`, where `null` means "reject with 204". Dates are revived from ISO strings.
- **Sweep publication**: `claimNext` in a loop up to 200, then one `publisher.publish(batch)` of up to 100 per call, then `markPublished`. A failed publish leaves the events pending; they are retried after the lease.
- **Job registry**: `di.ts` passes `scheduledJobs: IScheduledJob[]` (empty in this feature) to `RunSweepCommandHandler`. Later features append to it.
- **Config** (`config.events`):
  - `mode` (`local` | `pubsub`);
  - `gcpProjectId`;
  - `topic` (default `booking-events`);
  - `relayTimeoutMs` (2000);
  - `pendingWarningMinutes` (5).

  `config.internalAuth`:
  - `audience`;
  - `allowedInvokers` (a comma-separated list).

  `pubsub` mode fails fast at startup when a required value is missing.

## Complexity Tracking

*No entries.*
