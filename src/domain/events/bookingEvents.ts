import type { Booking } from '../bookings/booking.js';
import type { GoalkeeperRequest } from '../bookings/goalkeeperRequest.js';
import type { GoalkeeperIncident } from '../goalkeepers/goalkeeperIncident.js';
import type { PenaltyKind } from '../goalkeepers/penaltyPolicy.js';
import type { DomainEvent } from './domainEvent.js';

export interface BookingCreatedPayload {
  clientId: string;
  zoneId: string;
  startsAt: Date;
  commission: number;
  currency: string;
  /** How many goalkeepers the whole request asked for. */
  goalkeeperCount: number;
  /** Set when the booking replaces one a goalkeeper withdrew from (feature 018). */
  replacesBookingId?: string;
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
  reason: 'cancel_all' | 'client_cancelled';
  by: 'system' | 'client';
}

export interface GoalkeeperWithdrewPayload {
  goalkeeperId: string;
  clientId: string;
  zoneId: string;
  startsAt: Date;
  noticeMinutes: number;
  late: boolean;
  /** The booking created in its place, or null when the search was already over. */
  replacementBookingId: string | null;
  /** The goalkeeper's suspension end, set only when this withdrawal applied a penalty. */
  suspendedUntil: Date | null;
  penalties: Array<{ kind: PenaltyKind; days: number; endsAt: Date }>;
}

export interface GoalkeeperCheckedInPayload {
  goalkeeperId: string;
  clientId: string;
  zoneId: string;
  startsAt: Date;
  checkedInAt: Date;
  distanceMeters: number | null;
}

export interface BookingCompletedPayload {
  clientId: string;
  goalkeeperId: string;
  zoneId: string;
  startsAt: Date;
  completedAt: Date;
  checkedIn: boolean;
}

export interface GoalkeeperNoShowPayload {
  goalkeeperId: string;
  clientId: string;
  zoneId: string;
  startsAt: Date;
  incidentId: string;
  /** The goalkeeper's suspension end after the no-show. */
  suspendedUntil: Date | null;
  penalties: Array<{ kind: PenaltyKind; days: number; endsAt: Date }>;
}

export type BookingCreatedEvent = DomainEvent<'booking.created', BookingCreatedPayload>;
export type BookingExpiredEvent = DomainEvent<'booking.expired', BookingExpiredPayload>;
export type BookingCancelledEvent = DomainEvent<'booking.cancelled', BookingCancelledPayload>;
export type GoalkeeperAssignedEvent = DomainEvent<'goalkeeper.assigned', GoalkeeperAssignedPayload>;
export type GoalkeeperWithdrewEvent = DomainEvent<'goalkeeper.withdrew', GoalkeeperWithdrewPayload>;
export type GoalkeeperCheckedInEvent = DomainEvent<'goalkeeper.checked_in', GoalkeeperCheckedInPayload>;
export type BookingCompletedEvent = DomainEvent<'booking.completed', BookingCompletedPayload>;
export type GoalkeeperNoShowEvent = DomainEvent<'goalkeeper.no_show', GoalkeeperNoShowPayload>;
export type BookingEvent =
  | BookingCreatedEvent
  | GoalkeeperAssignedEvent
  | BookingExpiredEvent
  | BookingCancelledEvent
  | GoalkeeperWithdrewEvent
  | GoalkeeperCheckedInEvent
  | BookingCompletedEvent
  | GoalkeeperNoShowEvent;

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
      ...(booking.replacesBookingId ? { replacesBookingId: booking.replacesBookingId } : {}),
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
 * The booking was cancelled: by the system because its "cancel all" request wasn't complete in
 * time (feature 016, the default author), or by the client (feature 017). `booking` is as it was before the cancellation, so an assigned one names its
 * goalkeeper; `refund` is what that goalkeeper got back.
 */
export function bookingCancelled(
  id: string,
  booking: Booking,
  at: Date,
  refund: { amount: number; currency: string } | null,
  author: { reason: BookingCancelledPayload['reason']; by: BookingCancelledPayload['by'] } = { reason: 'cancel_all', by: 'system' },
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
      reason: author.reason,
      by: author.by,
    },
  };
}

/**
 * The goalkeeper withdrew from a booking they held (feature 018). `withdrawn` is the booking as it
 * was before (it names the goalkeeper); `suspendedUntil` is set only when a penalty was applied.
 */
export function goalkeeperWithdrew(
  id: string,
  withdrawn: Booking,
  incident: GoalkeeperIncident,
  suspendedUntil: Date | null,
  at: Date,
): GoalkeeperWithdrewEvent {
  return {
    id,
    type: 'goalkeeper.withdrew',
    version: 1,
    occurredAt: at,
    bookingId: withdrawn.id,
    requestId: withdrawn.requestId,
    payload: {
      goalkeeperId: incident.goalkeeperId,
      clientId: withdrawn.clientId,
      zoneId: withdrawn.zoneId,
      startsAt: withdrawn.startsAt,
      noticeMinutes: incident.noticeMinutes,
      late: incident.late,
      replacementBookingId: incident.replacementBookingId,
      suspendedUntil: incident.penalties.length > 0 ? suspendedUntil : null,
      penalties: incident.penalties.map((penalty) => ({ kind: penalty.kind, days: penalty.days, endsAt: penalty.endsAt })),
    },
  };
}

/** The goalkeeper checked in at the pitch (feature 020). The booking must carry its check-in. */
export function goalkeeperCheckedIn(id: string, booking: Booking, at: Date): GoalkeeperCheckedInEvent {
  if (!booking.checkIn || !booking.goalkeeperId) throw new Error(`Booking ${booking.id} has no check-in`);
  return {
    id,
    type: 'goalkeeper.checked_in',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: {
      goalkeeperId: booking.goalkeeperId,
      clientId: booking.clientId,
      zoneId: booking.zoneId,
      startsAt: booking.startsAt,
      checkedInAt: booking.checkIn.at,
      distanceMeters: booking.checkIn.distanceMeters,
    },
  };
}

/** The match ended with the booking assigned (feature 021). */
export function bookingCompleted(id: string, booking: Booking, at: Date): BookingCompletedEvent {
  if (booking.status !== 'completed' || !booking.goalkeeperId || !booking.completedAt) throw new Error(`Booking ${booking.id} is not completed`);
  return {
    id,
    type: 'booking.completed',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: {
      clientId: booking.clientId,
      goalkeeperId: booking.goalkeeperId,
      zoneId: booking.zoneId,
      startsAt: booking.startsAt,
      completedAt: booking.completedAt,
      checkedIn: booking.checkIn !== null,
    },
  };
}

/** The goalkeeper didn't attend (feature 021): recorded as a late withdrawal by the penalty policy. */
export function goalkeeperNoShow(id: string, booking: Booking, incident: GoalkeeperIncident, suspendedUntil: Date | null, at: Date): GoalkeeperNoShowEvent {
  return {
    id,
    type: 'goalkeeper.no_show',
    version: 1,
    occurredAt: at,
    bookingId: booking.id,
    requestId: booking.requestId,
    payload: {
      goalkeeperId: incident.goalkeeperId,
      clientId: booking.clientId,
      zoneId: booking.zoneId,
      startsAt: booking.startsAt,
      incidentId: incident.id,
      suspendedUntil,
      penalties: incident.penalties.map((penalty) => ({ kind: penalty.kind, days: penalty.days, endsAt: penalty.endsAt })),
    },
  };
}
