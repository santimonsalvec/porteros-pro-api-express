import type { DomainEvent } from '../../../../domain/events/domainEvent.js';

/** Hands events to the delivery mechanism (Pub/Sub, or the in-process mediator locally). */
export interface IEventPublisher {
  /** Rejects when any event could not be handed over. Honors `signal` to give up early. */
  publish(events: readonly DomainEvent[], signal?: AbortSignal): Promise<void>;
}

/** The outbox as the application sees it; events are inserted by the stores' transactions. */
export interface IOutboxStore {
  markPublished(ids: readonly string[], at: Date): Promise<void>;
  /**
   * Atomically leases up to `limit` pending events whose lease expired, oldest first. Two
   * callers never get the same event while its lease runs (research §11).
   */
  claimNext(now: Date, leaseSeconds: number, limit: number): Promise<DomainEvent[]>;
  pendingStats(now: Date): Promise<{ count: number; oldestCreatedAt: Date | null }>;
}

/** Publishes the events an operation just recorded, before it responds. Never throws. */
export interface IEventRelay {
  relay(events: readonly DomainEvent[]): Promise<void>;
}

/** Which consumer already processed which event (research §7). */
export interface IProcessedEventStore {
  has(key: string): Promise<boolean>;
  /** Ignores a concurrent duplicate. */
  markProcessed(key: string, at: Date): Promise<void>;
}

/** A time-based unit of work run by every sweep. It must be safe to run again. */
export interface IScheduledJob {
  readonly name: string;
  /** How long a sweep may hold this job before another sweep may take it over. */
  readonly leaseSeconds: number;
  /** Returns an optional short description of what it did, for the sweep report. */
  run(now: Date): Promise<string | void>;
}

export interface IJobLockStore {
  /** True when this caller now holds the job until `now + leaseSeconds`. */
  tryAcquire(name: string, now: Date, leaseSeconds: number): Promise<boolean>;
  release(name: string, now: Date): Promise<void>;
}

/** The example consumer's store: one entry per event received (FR-016). */
export interface IEventDeliveryLog {
  record(event: DomainEvent, at: Date): Promise<'recorded' | 'duplicate'>;
}

/** The logging the event machinery needs, so the application never imports pino. */
export interface IEventLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
}
