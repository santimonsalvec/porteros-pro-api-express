import type { Booking } from '../bookings/booking.js';
import type { GoalkeeperRequest } from '../bookings/goalkeeperRequest.js';
import type { DomainEvent } from './domainEvent.js';

export interface BookingCreatedPayload {
  clientId: string;
  zoneId: string;
  startsAt: Date;
  commission: number;
  currency: string;
  /** How many goalkeepers the whole request asked for. */
  goalkeeperCount: number;
}

export interface GoalkeeperAssignedPayload {
  goalkeeperId: string;
  clientId: string;
  zoneId: string;
  startsAt: Date;
  /** The commission charged at acceptance. */
  commission: number;
}

export interface BookingExpiredPayload {
  clientId: string;
  zoneId: string;
  startsAt: Date;
}

export interface BookingCancelledPayload {
  clientId: string;
  zoneId: string;
  startsAt: Date;
  /** The goalkeeper who held it, when it was assigned. */
  goalkeeperId: string | null;
  /** The commission given back to that goalkeeper, when there was one. */
  refundedAmount: number | null;
  currency: string;
  reason: 'cancel_all';
  by: 'system';
}

export type BookingCreatedEvent = DomainEvent<'booking.created', BookingCreatedPayload>;
export type BookingExpiredEvent = DomainEvent<'booking.expired', BookingExpiredPayload>;
export type BookingCancelledEvent = DomainEvent<'booking.cancelled', BookingCancelledPayload>;
export type GoalkeeperAssignedEvent = DomainEvent<'goalkeeper.assigned', GoalkeeperAssignedPayload>;
export type BookingEvent = BookingCreatedEvent | GoalkeeperAssignedEvent | BookingExpiredEvent | BookingCancelledEvent;

/** One per booking created by a confirmation (spec clarification 1). */
export function bookingCreated(id: string, booking: Booking, request: GoalkeeperRequest, at: Date): BookingCreatedEvent {
  return {
    id,
    type: 'booking.created',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: {
      clientId: booking.clientId,
      zoneId: booking.zoneId,
      startsAt: booking.startsAt,
      commission: booking.commission,
      currency: booking.price.currency,
      goalkeeperCount: request.goalkeeperCount,
    },
  };
}

/** Recorded by a successful acceptance (spec clarification 2). The booking must be assigned. */
export function goalkeeperAssigned(id: string, booking: Booking, at: Date): GoalkeeperAssignedEvent {
  if (booking.status !== 'assigned' || !booking.goalkeeperId) {
    throw new Error(`Booking ${booking.id} is not assigned`);
  }
  return {
    id,
    type: 'goalkeeper.assigned',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: {
      goalkeeperId: booking.goalkeeperId,
      clientId: booking.clientId,
      zoneId: booking.zoneId,
      startsAt: booking.startsAt,
      commission: booking.commission,
    },
  };
}

/** The search ended with nobody taking the booking (feature 016). */
export function bookingExpired(id: string, booking: Booking, at: Date): BookingExpiredEvent {
  return {
    id,
    type: 'booking.expired',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: { clientId: booking.clientId, zoneId: booking.zoneId, startsAt: booking.startsAt },
  };
}

/**
 * The system cancelled the booking because its "cancel all" request wasn't complete in time
 * (feature 016). `booking` is as it was before the cancellation, so an assigned one names its
 * goalkeeper; `refund` is what that goalkeeper got back.
 */
export function bookingCancelled(
  id: string,
  booking: Booking,
  at: Date,
  refund: { amount: number; currency: string } | null,
): BookingCancelledEvent {
  return {
    id,
    type: 'booking.cancelled',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: {
      clientId: booking.clientId,
      zoneId: booking.zoneId,
      startsAt: booking.startsAt,
      goalkeeperId: booking.goalkeeperId,
      refundedAmount: refund?.amount ?? null,
      currency: refund?.currency ?? booking.price.currency,
      reason: 'cancel_all',
      by: 'system',
    },
  };
}
