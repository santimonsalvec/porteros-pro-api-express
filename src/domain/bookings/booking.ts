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

/** Why a booking ended without being played (features 016, 017 and 018). */
export type BookingEndReason = 'search_ended' | 'cancel_all' | 'client_cancelled' | 'goalkeeper_withdrew';
/** Who ended it: the system (016), the client (017) or the goalkeeper who withdrew (018). */
export type BookingEndedBy = 'system' | 'client' | 'goalkeeper';

/** The client's optional reason when cancelling (feature 017). */
export const MAX_CANCELLATION_NOTE_LENGTH = 200;

/** The trimmed reason, `null` when empty; throws when longer than allowed. */
export function normalizeCancellationNote(raw?: string | null): string | null {
  const note = raw?.trim() ?? '';
  if (note === '') return null;
  if (note.length > MAX_CANCELLATION_NOTE_LENGTH) {
    throw new Error(`Cancellation note must have at most ${MAX_CANCELLATION_NOTE_LENGTH} characters`);
  }
  return note;
}

/** The goalkeeper's proof of arrival (feature 020). The location never blocks it; the client never sees it. */
export interface CheckIn {
  at: Date;
  imageId: string;
  photoUrl: string;
  location: { latitude: number; longitude: number; accuracyMeters: number | null } | null;
  /** From the phone to the match point, when there was a location. */
  distanceMeters: number | null;
}

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
  /** The client's reason when they cancelled it, or the goalkeeper's when they withdrew. */
  cancellationNote?: string | null;
  /** The withdrawn booking this one replaces (feature 018). */
  replacesBookingId?: string | null;
  /** Goalkeepers who can never take it: those who withdrew from the bookings it replaces. */
  excludedGoalkeeperIds?: readonly string[];
  /** Feature 020: the check-in, and when each check-in notice was sent. */
  checkIn?: CheckIn | null;
  checkInOpenNoticeAt?: Date | null;
  checkInLastCallAt?: Date | null;
  /** No check-in by the window close: the client was told. The attendance fact 021 reads. */
  checkInMissedAt?: Date | null;
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
  readonly cancellationNote: string | null;
  readonly replacesBookingId: string | null;
  readonly excludedGoalkeeperIds: readonly string[];
  readonly checkIn: CheckIn | null;
  readonly checkInOpenNoticeAt: Date | null;
  readonly checkInLastCallAt: Date | null;
  readonly checkInMissedAt: Date | null;

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
    this.cancellationNote = props.cancellationNote ?? null;
    this.replacesBookingId = props.replacesBookingId ?? null;
    this.excludedGoalkeeperIds = [...(props.excludedGoalkeeperIds ?? [])];
    this.checkIn = props.checkIn ? { ...props.checkIn, at: new Date(props.checkIn.at) } : null;
    this.checkInOpenNoticeAt = props.checkInOpenNoticeAt ? new Date(props.checkInOpenNoticeAt) : null;
    this.checkInLastCallAt = props.checkInLastCallAt ? new Date(props.checkInLastCallAt) : null;
    this.checkInMissedAt = props.checkInMissedAt ? new Date(props.checkInMissedAt) : null;
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

  /**
   * The booking that takes the place of one a goalkeeper withdrew from (feature 018): the same
   * match, price, commission and end of search, awaiting a new goalkeeper. The one who withdrew
   * (and whoever the original already excluded) can never take it.
   */
  static replacementFor(original: Booking, id: string, withdrawingGoalkeeperId: string, now: Date): Booking {
    return new Booking({
      id,
      requestId: original.requestId,
      clientId: original.clientId,
      zoneId: original.zoneId,
      startsAt: original.startsAt,
      endsAt: original.endsAt,
      status: 'pending_assignment',
      price: original.price,
      commission: original.commission,
      travelBufferMinutes: original.travelBufferMinutes,
      searchEndsAt: original.searchEndsAt,
      goalkeeperId: null,
      assignedAt: null,
      createdAt: now,
      replacesBookingId: original.id,
      excludedGoalkeeperIds: [...new Set([...original.excludedGoalkeeperIds, withdrawingGoalkeeperId])],
    });
  }

  static rehydrate(props: BookingProps): Booking {
    return new Booking(props);
  }

  /** Goalkeepers can take it strictly before `searchEndsAt` (start − travel margin). */
  isSearchOpenAt(now: Date): boolean {
    return now.getTime() < this.searchEndsAt.getTime();
  }

  /** Whole minutes left before the start (0 once started): how much notice a withdrawal gives. */
  withdrawalNoticeMinutes(now: Date): number {
    return Math.max(0, Math.floor((this.startsAt.getTime() - now.getTime()) / 60_000));
  }

  /** The booking once a goalkeeper has taken it. Only a pending booking can be assigned. */
  assign(goalkeeperId: string, at: Date): Booking {
    if (this.status !== 'pending_assignment') throw new Error(`Booking ${this.id} is ${this.status}, not pending`);
    return new Booking({ ...this, status: 'assigned', goalkeeperId, assignedAt: at });
  }
}
