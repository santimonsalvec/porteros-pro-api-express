import { Entity } from '../common/entity.js';
import type { GoalkeeperPrice } from './goalkeeperPrice.js';
import type { GoalkeeperRequest } from './goalkeeperRequest.js';

/**
 * Every state a booking can be in. `pending_assignment` and `assigned` are reachable today; the
 * transitions into the others belong to later features (expiry, cancellation, withdrawal, close).
 */
export const BOOKING_STATUSES = [
  'pending_assignment',
  'assigned',
  'cancelled',
  'expired',
  'goalkeeper_withdrew',
  'completed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Why a booking ended without being played (feature 016; 017 and 018 add theirs). */
export type BookingEndReason = 'search_ended' | 'cancel_all';
/** Who ended it (feature 016: always the system; 017 adds the client). */
export type BookingEndedBy = 'system';

export interface BookingProps {
  id: string;
  requestId: string;
  clientId: string;
  zoneId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  price: GoalkeeperPrice;
  commission: number;
  travelBufferMinutes: number;
  searchEndsAt: Date;
  goalkeeperId: string | null;
  assignedAt: Date | null;
  createdAt: Date;
  /** When it expired or was cancelled; absent on older documents. */
  endedAt?: Date | null;
  endReason?: BookingEndReason | null;
  cancelledBy?: BookingEndedBy | null;
}

/**
 * One goalkeeper's place in a request. The client, zone, start, end, commission and travel margin
 * are copies of the request's, written once and never updated, so bookings can be queried on
 * their own. `searchEndsAt` (start − margin) is when goalkeepers can no longer take it.
 */
export class Booking extends Entity<string> {
  readonly requestId: string;
  readonly clientId: string;
  readonly zoneId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: BookingStatus;
  readonly price: GoalkeeperPrice;
  /** The platform's commission, fixed when the quote was issued. */
  readonly commission: number;
  readonly travelBufferMinutes: number;
  readonly searchEndsAt: Date;
  readonly goalkeeperId: string | null;
  readonly assignedAt: Date | null;
  readonly createdAt: Date;
  readonly endedAt: Date | null;
  readonly endReason: BookingEndReason | null;
  readonly cancelledBy: BookingEndedBy | null;

  private constructor(props: BookingProps) {
    super(props.id);
    if (!BOOKING_STATUSES.includes(props.status)) {
      throw new Error(`Booking: unknown status '${props.status}'`);
    }
    if ((props.goalkeeperId === null) !== (props.assignedAt === null)) {
      throw new Error('Booking: goalkeeperId and assignedAt are set together');
    }
    this.requestId = props.requestId;
    this.clientId = props.clientId;
    this.zoneId = props.zoneId;
    this.startsAt = new Date(props.startsAt);
    this.endsAt = new Date(props.endsAt);
    this.status = props.status;
    this.price = props.price;
    this.commission = props.commission;
    this.travelBufferMinutes = props.travelBufferMinutes;
    this.searchEndsAt = new Date(props.searchEndsAt);
    this.goalkeeperId = props.goalkeeperId;
    this.assignedAt = props.assignedAt ? new Date(props.assignedAt) : null;
    this.createdAt = new Date(props.createdAt);
    this.endedAt = props.endedAt ? new Date(props.endedAt) : null;
    this.endReason = props.endReason ?? null;
    this.cancelledBy = props.cancelledBy ?? null;
  }

  /** A new place for one goalkeeper, at the request's per-goalkeeper price, awaiting assignment. */
  static forRequest(id: string, request: GoalkeeperRequest, createdAt: Date): Booking {
    const startMs = request.startsAt.getTime();
    return new Booking({
      id,
      requestId: request.id,
      clientId: request.clientId,
      zoneId: request.zoneId,
      startsAt: request.startsAt,
      endsAt: new Date(startMs + request.match.durationMinutes * 60_000),
      status: 'pending_assignment',
      price: request.pricing.perGoalkeeper(),
      commission: request.commission,
      travelBufferMinutes: request.travelBufferMinutes,
      searchEndsAt: new Date(startMs - request.travelBufferMinutes * 60_000),
      goalkeeperId: null,
      assignedAt: null,
      createdAt,
    });
  }

  static rehydrate(props: BookingProps): Booking {
    return new Booking(props);
  }

  /** Goalkeepers can take it strictly before `searchEndsAt` (start − travel margin). */
  isSearchOpenAt(now: Date): boolean {
    return now.getTime() < this.searchEndsAt.getTime();
  }

  /** The booking once a goalkeeper has taken it. Only a pending booking can be assigned. */
  assign(goalkeeperId: string, at: Date): Booking {
    if (this.status !== 'pending_assignment') throw new Error(`Booking ${this.id} is ${this.status}, not pending`);
    return new Booking({ ...this, status: 'assigned', goalkeeperId, assignedAt: at });
  }
}
