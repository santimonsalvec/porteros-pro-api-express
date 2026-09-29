/** Every event type the platform records (feature 013). Later features add theirs here. */
export type DomainEventType =
  | 'booking.created'
  | 'goalkeeper.assigned'
  | 'booking.expired'
  | 'booking.cancelled'
  | 'goalkeeper.withdrew'
  | 'goalkeeper.checked_in'
  | 'booking.completed'
  | 'goalkeeper.no_show';

/**
 * A past fact about a booking, recorded in the same transaction as the change that produced it
 * and published to every subscriber at least once. The payload is small, ids first: consumers
 * read whatever else they need (roadmap §4.1).
 */
export interface DomainEvent<TType extends DomainEventType = DomainEventType, TPayload = unknown> {
  /** Unique; consumers deduplicate on it. */
  readonly id: string;
  readonly type: TType;
  readonly version: 1;
  readonly occurredAt: Date;
  readonly bookingId: string;
  readonly requestId: string;
  readonly payload: TPayload;
}
