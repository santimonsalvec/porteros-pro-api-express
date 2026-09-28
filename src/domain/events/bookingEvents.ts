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

export type BookingCreatedEvent = DomainEvent<'booking.created', BookingCreatedPayload>;
export type GoalkeeperAssignedEvent = DomainEvent<'goalkeeper.assigned', GoalkeeperAssignedPayload>;
export type BookingEvent = BookingCreatedEvent | GoalkeeperAssignedEvent;

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
