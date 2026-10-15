import { Entity } from '../common/entity.js';
import { withDiscount, type GoalkeeperPrice } from './goalkeeperPrice.js';
import type { VettingTier } from '../goalkeepers/vetting.js';
import { discountFor } from '../pricing/unverifiedDiscount.js';
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

/** Why a booking ended without being played (features 016, 017 and 018; admin spec 006). */
export type BookingEndReason = 'search_ended' | 'cancel_all' | 'client_cancelled' | 'goalkeeper_withdrew' | 'admin_cancelled';
/** Who ended it: the system (016), the client (017), the goalkeeper who withdrew (018) or an administrator (admin 006). */
export type BookingEndedBy = 'system' | 'client' | 'goalkeeper' | 'admin';

/** The client's optional reason when cancelling (feature 017). */
export const MAX_CANCELLATION_NOTE_LENGTH = 200;

/** An administrator's reason when cancelling (admin spec 006): internal, never shown to the app. */
export const ADMIN_CANCELLATION_REASON_MIN = 3;
export const ADMIN_CANCELLATION_REASON_MAX = 300;

/** Trimmed; throws unless 3–300 characters. */
export function normalizeAdminCancellationReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length < ADMIN_CANCELLATION_REASON_MIN || reason.length > ADMIN_CANCELLATION_REASON_MAX) {
    throw new Error(
      `Admin cancellation reason must have between ${ADMIN_CANCELLATION_REASON_MIN} and ${ADMIN_CANCELLATION_REASON_MAX} characters`,
    );
  }
  return reason;
}

/**
 * Whether the booking left its request on purpose — cancelled by the client (017) or by an
 * administrator (admin 006). Those no longer count for "cancel all" (016) nor for the client's outcome.
 */
export function leftTheRequest(booking: Pick<Booking, 'cancelledBy'>): boolean {
  return booking.cancelledBy === 'client' || booking.cancelledBy === 'admin';
}

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

/** Whether the goalkeeper attended (feature 021): by check-in, the client's answer, or the no-show rule. */
export type BookingAttendance = 'attended' | 'no_show';

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
  /** The client's reason when they cancelled it, the goalkeeper's when they withdrew, or the administrator's (internal). */
  cancellationNote?: string | null;
  /** The staff member (user id) who cancelled it as an administrator (admin 006); absent otherwise. */
  cancelledByStaffId?: string | null;
  /** The withdrawn booking this one replaces (feature 018). */
  replacesBookingId?: string | null;
  /** Goalkeepers who can never take it: those who withdrew from the bookings it replaces. */
  excludedGoalkeeperIds?: readonly string[];
  /** Goalkeepers who said "No me interesa" to its request (feature 024): it is never offered to them. */
  dismissedGoalkeeperIds?: readonly string[];
  /** Feature 020: the check-in, and when each check-in notice was sent. */
  checkIn?: CheckIn | null;
  checkInOpenNoticeAt?: Date | null;
  checkInLastCallAt?: Date | null;
  /** No check-in by the window close: the client was told. The attendance fact 021 reads. */
  checkInMissedAt?: Date | null;
  /** Feature 021: when the match ended with the booking assigned, and whether the goalkeeper came. */
  completedAt?: Date | null;
  attendance?: BookingAttendance | null;
  noShowAt?: Date | null;
  /** Admin spec 030: copied from the request; absent on older documents (= no, 0, `createdAt`). */
  acceptsUnverified?: boolean;
  unverifiedDiscountBps?: number;
  /** Until this instant only verified goalkeepers can take it. */
  verifiedOnlyUntil?: Date | null;
  /** Whether whoever took it had the seal; `null` while pending (absent on older documents). */
  goalkeeperVerified?: boolean | null;
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
  readonly cancelledByStaffId: string | null;
  readonly replacesBookingId: string | null;
  readonly excludedGoalkeeperIds: readonly string[];
  readonly dismissedGoalkeeperIds: readonly string[];
  readonly checkIn: CheckIn | null;
  readonly checkInOpenNoticeAt: Date | null;
  readonly checkInLastCallAt: Date | null;
  readonly checkInMissedAt: Date | null;
  readonly completedAt: Date | null;
  readonly attendance: BookingAttendance | null;
  readonly noShowAt: Date | null;
  /** The client accepts goalkeepers without the seal once the verified-only window ends (admin spec 030). */
  readonly acceptsUnverified: boolean;
  /** The discount for an unverified goalkeeper, fixed when quoting (basis points). */
  readonly unverifiedDiscountBps: number;
  readonly verifiedOnlyUntil: Date;
  /** Whether the assigned goalkeeper had the seal when they took it; `null` while nobody has. */
  readonly goalkeeperVerified: boolean | null;

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
    this.cancelledByStaffId = props.cancelledByStaffId ?? null;
    this.replacesBookingId = props.replacesBookingId ?? null;
    this.excludedGoalkeeperIds = [...(props.excludedGoalkeeperIds ?? [])];
    this.dismissedGoalkeeperIds = [...(props.dismissedGoalkeeperIds ?? [])];
    this.checkIn = props.checkIn ? { ...props.checkIn, at: new Date(props.checkIn.at) } : null;
    this.checkInOpenNoticeAt = props.checkInOpenNoticeAt ? new Date(props.checkInOpenNoticeAt) : null;
    this.checkInLastCallAt = props.checkInLastCallAt ? new Date(props.checkInLastCallAt) : null;
    this.checkInMissedAt = props.checkInMissedAt ? new Date(props.checkInMissedAt) : null;
    this.completedAt = props.completedAt ? new Date(props.completedAt) : null;
    this.attendance = props.attendance ?? null;
    this.noShowAt = props.noShowAt ? new Date(props.noShowAt) : null;
    this.acceptsUnverified = props.acceptsUnverified ?? false;
    this.unverifiedDiscountBps = props.unverifiedDiscountBps ?? 0;
    this.verifiedOnlyUntil = new Date(props.verifiedOnlyUntil ?? props.createdAt);
    this.goalkeeperVerified = props.goalkeeperVerified ?? null;
  }

  /**
   * A new place for one goalkeeper, at the request's per-goalkeeper price, awaiting assignment. For
   * `verifiedPriorityMinutes` only verified goalkeepers can take it, never past the end of the search.
   */
  static forRequest(id: string, request: GoalkeeperRequest, createdAt: Date, verifiedPriorityMinutes = 0): Booking {
    const startMs = request.startsAt.getTime();
    const searchEndsAt = startMs - request.travelBufferMinutes * 60_000;
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
      searchEndsAt: new Date(searchEndsAt),
      goalkeeperId: null,
      assignedAt: null,
      createdAt,
      acceptsUnverified: request.acceptsUnverified,
      unverifiedDiscountBps: request.unverifiedDiscountBps,
      verifiedOnlyUntil: new Date(Math.min(createdAt.getTime() + verifiedPriorityMinutes * 60_000, searchEndsAt)),
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
      // The full price again: whoever takes the replacement decides the discount (admin spec 030).
      price: withDiscount(original.price, 0),
      commission: original.commission,
      travelBufferMinutes: original.travelBufferMinutes,
      searchEndsAt: original.searchEndsAt,
      goalkeeperId: null,
      assignedAt: null,
      createdAt: now,
      replacesBookingId: original.id,
      excludedGoalkeeperIds: [...new Set([...original.excludedGoalkeeperIds, withdrawingGoalkeeperId])],
      // Whoever dismissed the match keeps not seeing it (feature 024).
      dismissedGoalkeeperIds: original.dismissedGoalkeeperIds,
      acceptsUnverified: original.acceptsUnverified,
      unverifiedDiscountBps: original.unverifiedDiscountBps,
      verifiedOnlyUntil: original.verifiedOnlyUntil,
    });
  }

  static rehydrate(props: BookingProps): Booking {
    return new Booking(props);
  }

  /** Whether this goalkeeper withdrew from the place it replaces or dismissed its request. */
  isClosedTo(goalkeeperId: string): boolean {
    return this.excludedGoalkeeperIds.includes(goalkeeperId) || this.dismissedGoalkeeperIds.includes(goalkeeperId);
  }

  /** Goalkeepers can take it strictly before `searchEndsAt` (start − travel margin). */
  isSearchOpenAt(now: Date): boolean {
    return now.getTime() < this.searchEndsAt.getTime();
  }

  /** Whole minutes left before the start (0 once started): how much notice a withdrawal gives. */
  withdrawalNoticeMinutes(now: Date): number {
    return Math.max(0, Math.floor((this.startsAt.getTime() - now.getTime()) / 60_000));
  }

  /**
   * The booking once a goalkeeper has taken it. Only a pending booking can be assigned. A
   * validated goalkeeper without the seal takes it at the discounted price (admin spec 030): the
   * commission stays as it was, so the goalkeeper absorbs the discount.
   */
  assign(goalkeeperId: string, at: Date, tier: VettingTier = 'verified'): Booking {
    if (this.status !== 'pending_assignment') throw new Error(`Booking ${this.id} is ${this.status}, not pending`);
    const verified = tier === 'verified';
    const full = this.price.unitRate + this.price.unitSurcharge;
    const discount = verified ? 0 : discountFor(full, this.unverifiedDiscountBps, this.commission);
    return new Booking({ ...this, status: 'assigned', goalkeeperId, assignedAt: at, price: withDiscount(this.price, discount), goalkeeperVerified: verified });
  }
}
