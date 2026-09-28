# Data Model: Reliable Domain Events and Scheduled Jobs

**Feature**: `013-domain-events-outbox` | **Date**: 2026-09-28 | **Research**: [research.md](./research.md)

## Domain (`src/domain/events/`)

```ts
type DomainEventType = 'booking.created' | 'goalkeeper.assigned';

interface DomainEvent<TType extends DomainEventType = DomainEventType, TPayload = unknown> {
  id: string;            // uuid v7
  type: TType;
  version: 1;
  occurredAt: Date;
  bookingId: string;
  requestId: string;
  payload: TPayload;
}

// bookingEvents.ts — pure factories
bookingCreated(id, booking, request, at): DomainEvent<'booking.created', {
  clientId; zoneId; startsAt; commission; currency; goalkeeperCount }>
goalkeeperAssigned(id, booking, at): DomainEvent<'goalkeeper.assigned', {
  goalkeeperId; clientId; zoneId; startsAt; commission }>
```

## Collection `outbox`

| Field | Type | Notes |
|---|---|---|
| `_id` | string | The event id |
| `type`, `version`, `occurredAt`, `bookingId`, `requestId`, `payload` | | The event |
| `status` | `'pending' \| 'published'` | |
| `attempts` | integer | Incremented by every sweep claim |
| `claimedUntil` | Date | Lease. It is `createdAt + 30 s` at insertion (the in-request relay) and `now + 60 s` on each sweep claim |
| `publishedAt` | Date \| absent | Set when marked published; the TTL key |
| `createdAt` | Date | Oldest-first order |

| Index | Definition | Serves |
|---|---|---|
| `status_claimed_created` | `{ status: 1, claimedUntil: 1, createdAt: 1 }` | Sweep claim (research §11) |
| `published_ttl` | `{ publishedAt: 1 }`, `expireAfterSeconds: 604800` | 7-day retention; pending events are never removed (§3) |

## Collection `processedEvents`

| Field | Type | Notes |
|---|---|---|
| `_id` | string | `'<consumer>:<eventId>'` |
| `consumer`, `eventId` | string | |
| `processedAt` | Date | TTL key, 30 days |

Index: `processed_ttl` `{ processedAt: 1 }`, with `expireAfterSeconds: 2592000`.

## Collection `jobLocks`

| Field | Type | Notes |
|---|---|---|
| `_id` | string | The job name |
| `lockedUntil` | Date | Lease |
| `lockedAt` | Date | |

Acquire is an upsert with the condition `lockedUntil <= now`: a duplicate key means another sweep holds the lock. Release sets `lockedUntil = now`.

## Collection `eventDeliveryLog` (example consumer)

| Field | Type |
|---|---|
| `_id` | string (the event id) |
| `type`, `bookingId`, `requestId` | string |
| `receivedAt` | Date |

A TTL of 30 days on `receivedAt`: the log is diagnostic only.

## Application ports

```ts
// common/events/ports.ts
interface IEventPublisher { publish(events: readonly DomainEvent[], signal?: AbortSignal): Promise<void> }
interface IOutboxStore {
  markPublished(ids: string[], at: Date): Promise<void>;
  claimNext(now: Date, leaseSeconds: number, limit: number): Promise<DomainEvent[]>;
  pendingStats(now: Date): Promise<{ count: number; oldestCreatedAt: Date | null }>;
}
interface IEventRelay { relay(events: readonly DomainEvent[]): Promise<void> }   // never throws
interface IProcessedEventStore { has(key: string): Promise<boolean>; markProcessed(key: string, at: Date): Promise<void> }
interface IScheduledJob { readonly name: string; readonly leaseSeconds: number; run(now: Date): Promise<string | void> }
interface IJobLockStore { tryAcquire(name: string, now: Date, leaseSeconds: number): Promise<boolean>; release(name: string, now: Date): Promise<void> }
interface IEventDeliveryLog { record(event: DomainEvent, at: Date): Promise<'recorded' | 'duplicate'> }

// mediator additions
interface INotification { readonly type: string }
interface INotificationHandler<T extends INotification> { readonly name: string; handle(n: T): Promise<void> }
interface IPublisher { publish(n: INotification, options?: { only?: string }): Promise<void> }  // throws EventHandlersFailedError
```

Changed stores:

```ts
IQuoteConfirmationStore.claimAndCreateRequest(..., build: (quote) => { request; bookings; events })
  // 'created' result also returns `events`
IBookingAcceptanceStore.accept({ ..., event: (booking: Booking) => DomainEvent })
  // 'accepted' result also returns `event`
```

## Commands

- `RunSweepCommand(): SweepReport`:

  ```ts
  { published: number; stillPending: number; oldestPendingSeconds: number | null;
    jobs: { name: string; outcome: 'succeeded' | 'failed' | 'skipped'; detail?: string }[] }
  ```

## Validation rules traced to requirements

| Rule | Where | Requirement |
|---|---|---|
| The event is written in the change's transaction | `appendEventsInSession` in both stores | FR-002, FR-003, FR-003a |
| No event on a replay or a refusal | only the `created`/`accepted` paths build events | FR-004 |
| Publish before responding, 2 s cap, never throws | `EventRelay` | FR-006, FR-007, FR-007a |
| Oldest first, atomic claim, lease | `claimNext` | FR-008, FR-021 |
| Pending warning after 5 min | sweep handler | FR-009 |
| 7-day retention; pending events never removed | TTL on `publishedAt` | FR-010 |
| Idempotent consumers | `runOnce` + `processedEvents` | FR-012 |
| Acknowledge, retry or reject | internal events controller | FR-013, FR-015 |
| Fan-out | `Mediator.publish` | FR-017 |
| Jobs are isolated and locked | sweep handler + `jobLocks` | FR-019–FR-021 |
| OIDC only | `requireGoogleOidc` | FR-023, FR-024 |
