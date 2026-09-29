import type { DomainEvent } from './domainEvent.js';

/**
 * A charge or refund the platform must invoice (feature 023), recorded in the same transaction as
 * its ledger movements. `base` is the platform's net, `vat` the tax charged on top of it.
 */
export interface BillingEventPayload {
  goalkeeperId: string;
  /** The billable movement (commission charge or refund, penalty or its reversal). */
  movementId: string;
  /** The VAT movement recorded with it; null at 0 %. */
  vatMovementId: string | null;
  base: number;
  vat: number;
  vatRateBps: number;
  currency: string;
  /** On a refund or reversal: the movement it gives back. */
  originalMovementId?: string;
}

export type BillingEventType = 'commission.charged' | 'commission.refunded' | 'penalty.charged' | 'penalty.reversed';
export type BillingEvent = DomainEvent<BillingEventType, BillingEventPayload>;

export const BILLING_EVENT_TYPES: readonly BillingEventType[] = ['commission.charged', 'commission.refunded', 'penalty.charged', 'penalty.reversed'];

interface BillingEnvelope {
  bookingId: string;
  requestId: string;
}

function billingEvent(type: BillingEventType, id: string, envelope: BillingEnvelope, at: Date, payload: BillingEventPayload): BillingEvent {
  return { id, type, version: 1, occurredAt: at, bookingId: envelope.bookingId, requestId: envelope.requestId, payload };
}

/** A commission (and its VAT) charged at acceptance (012). */
export function commissionCharged(id: string, envelope: BillingEnvelope, at: Date, payload: Omit<BillingEventPayload, 'originalMovementId'>): BillingEvent {
  return billingEvent('commission.charged', id, envelope, at, payload);
}

/** A commission (and its VAT) given back (016, 017, 018). */
export function commissionRefunded(id: string, envelope: BillingEnvelope, at: Date, payload: BillingEventPayload & { originalMovementId: string }): BillingEvent {
  return billingEvent('commission.refunded', id, envelope, at, payload);
}

/** A money penalty (and its VAT). No feature charges one yet (research §0). */
export function penaltyCharged(id: string, envelope: BillingEnvelope, at: Date, payload: Omit<BillingEventPayload, 'originalMovementId'>): BillingEvent {
  return billingEvent('penalty.charged', id, envelope, at, payload);
}

/** A money penalty (and its VAT) reversed by an administrator. */
export function penaltyReversed(id: string, envelope: BillingEnvelope, at: Date, payload: BillingEventPayload & { originalMovementId: string }): BillingEvent {
  return billingEvent('penalty.reversed', id, envelope, at, payload);
}

export function isBillingEvent(event: DomainEvent): event is BillingEvent {
  return (BILLING_EVENT_TYPES as readonly string[]).includes(event.type);
}
