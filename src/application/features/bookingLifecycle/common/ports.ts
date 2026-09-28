import type { Booking, BookingStatus } from '../../../../domain/bookings/booking.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import type { GoalkeeperIncident } from '../../../../domain/goalkeepers/goalkeeperIncident.js';
import type { GoalkeeperPenaltyConfig } from '../../../../domain/goalkeepers/penaltyPolicy.js';
import type { LedgerOwner } from '../../wallet/common/walletLedger.js';

export interface ExpireResult {
  /** The bookings this call expired (as they are now). Empty when another sweep already did. */
  expired: Booking[];
  events: DomainEvent[];
  /** The request no longer has any pending or assigned booking, so it stopped being active. */
  deactivated: boolean;
}

export type CancelAllResult =
  | { kind: 'already_evaluated' }
  /** Every booking was assigned: nothing changed, and the request is firm from now on. */
  | { kind: 'kept' }
  | { kind: 'cancelled'; cancelled: Booking[]; refunds: number; events: DomainEvent[] }
  /** An assigned booking has no commission charge to refund: nothing was changed (data problem). */
  | { kind: 'missing_charge'; bookingId: string };

export type ClientCancelResult =
  | { kind: 'cancelled'; cancelled: Booking[]; refunds: number; events: DomainEvent[] }
  /** Already cancelled by the client: nothing to do (idempotent). */
  | { kind: 'replayed' }
  | { kind: 'not_found'; what: 'request' | 'booking' }
  /** Ended otherwise (expired, cancelled by the system, completed, withdrawn). */
  | { kind: 'already_final'; status: string }
  /** An assigned booking is past start − free-cancellation period: nothing changed. */
  | { kind: 'window_closed'; bookingId: string; freeCancellationUntil: Date }
  /** A booking became assigned after the caller resolved the owners: resolve this one and retry. */
  | { kind: 'owner_required'; goalkeeperId: string }
  | { kind: 'missing_charge'; bookingId: string };

export type WithdrawResult =
  | {
      kind: 'withdrawn';
      /** The booking as it is now (`goalkeeper_withdrew`). */
      booking: Booking;
      incident: GoalkeeperIncident;
      replacement: Booking | null;
      /** The goalkeeper's suspension end after the withdrawal (null when not suspended). */
      suspendedUntil: Date | null;
      events: DomainEvent[];
    }
  /** Already withdrawn by this goalkeeper: nothing to do (idempotent). */
  | { kind: 'replayed'; booking: Booking; incident: GoalkeeperIncident; suspendedUntil: Date | null }
  /** No such booking, or this goalkeeper never held it. */
  | { kind: 'not_found' }
  | { kind: 'not_withdrawable'; status: BookingStatus }
  | { kind: 'match_started'; startsAt: Date };

export type ReversalOutcome =
  | { kind: 'reversed'; incident: GoalkeeperIncident; suspendedUntil: Date | null }
  /** Nothing was left to reverse. */
  | { kind: 'replayed'; incident: GoalkeeperIncident; suspendedUntil: Date | null }
  | { kind: 'not_found' }
  /** The booking has no commission charge to give back (data problem): nothing changed. */
  | { kind: 'missing_charge'; bookingId: string };

/**
 * The time-driven transitions of bookings (feature 016), each one all or nothing and effective
 * once: a second call on the same request finds nothing left to do.
 */
export interface IBookingLifecycleStore {
  expire(requestId: string, now: Date, buildEvents: (expired: readonly Booking[]) => DomainEvent[]): Promise<ExpireResult>;
  cancelAll(args: {
    requestId: string;
    now: Date;
    /** The ledger owner of each assigned goalkeeper, resolved beforehand. */
    owners: ReadonlyMap<string, LedgerOwner>;
    newId: () => string;
    /** `booking` as it was before the cancellation; `refund` is what its goalkeeper got back. */
    buildEvent: (booking: Booking, refund: { amount: number; currency: string } | null) => DomainEvent;
  }): Promise<CancelAllResult>;
  /**
   * The client cancels one booking (`bookingId`) or every live booking of their request (`null`),
   * all or nothing (feature 017). Refusals change nothing.
   */
  cancelByClient(args: {
    requestId: string;
    clientId: string;
    bookingId: string | null;
    now: Date;
    note: string | null;
    owners: ReadonlyMap<string, LedgerOwner>;
    newId: () => string;
    buildEvent: (booking: Booking, refund: { amount: number; currency: string } | null) => DomainEvent;
  }): Promise<ClientCancelResult>;
  /**
   * The goalkeeper withdraws from a booking they hold (feature 018), all or nothing: the booking
   * ends, a replacement is created while the search is open, the penalty policy is applied, the
   * goalkeeper's suspension end is recomputed and the events are recorded. Refusals change nothing.
   */
  withdraw(args: {
    bookingId: string;
    goalkeeperId: string;
    now: Date;
    note: string | null;
    config: GoalkeeperPenaltyConfig;
    newId: () => string;
    buildEvents: (withdrawn: Booking, incident: GoalkeeperIncident, replacement: Booking | null, suspendedUntil: Date | null) => DomainEvent[];
  }): Promise<WithdrawResult>;
  /**
   * An administrator reverses a withdrawal's money and/or suspensions (feature 018), once. `owner`
   * is required when `refund` is asked.
   */
  reverseWithdrawal(args: {
    goalkeeperId: string;
    withdrawalId: string;
    adminId: string;
    refund: boolean;
    liftSuspension: boolean;
    reason: string;
    now: Date;
    owner: LedgerOwner | null;
    newId: () => string;
  }): Promise<ReversalOutcome>;
}

/** A goalkeeper's withdrawals (and, from 021, no-shows), newest first. */
export interface IGoalkeeperIncidentRepository {
  listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<GoalkeeperIncident[]>;
  countForGoalkeeper(goalkeeperId: string): Promise<number>;
}

/** The logging the lifecycle needs, so the application never imports pino. */
export interface ILifecycleLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
}
