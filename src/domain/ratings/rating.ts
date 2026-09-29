import { Entity } from '../common/entity.js';
import type { Booking } from '../bookings/booking.js';

/** Who rates: the client rates the goalkeeper, the goalkeeper rates the client (feature 021). */
export type RatingSide = 'client' | 'goalkeeper';

/** How long after the match a rating stays due. */
export const RATING_DAYS = 7;
export const MAX_RATING_COMMENT_LENGTH = 500;

export interface RatingProps {
  id: string;
  bookingId: string;
  requestId: string;
  side: RatingSide;
  authorId: string;
  subjectId: string;
  /** Client: "did the goalkeeper come?". Goalkeeper: "were you paid?". */
  answer: boolean;
  stars: number;
  comment: string | null;
  createdAt: Date;
}

/** One side's minimal rating of one booking. Private (clarification 2): never shown to other users. */
export class Rating extends Entity<string> {
  readonly bookingId: string;
  readonly requestId: string;
  readonly side: RatingSide;
  readonly authorId: string;
  readonly subjectId: string;
  readonly answer: boolean;
  readonly stars: number;
  readonly comment: string | null;
  readonly createdAt: Date;

  private constructor(props: RatingProps) {
    super(props.id);
    if (!Number.isInteger(props.stars) || props.stars < 1 || props.stars > 5) throw new Error('Rating: stars must be an integer from 1 to 5');
    this.bookingId = props.bookingId;
    this.requestId = props.requestId;
    this.side = props.side;
    this.authorId = props.authorId;
    this.subjectId = props.subjectId;
    this.answer = props.answer;
    this.stars = props.stars;
    this.comment = normalizeRatingComment(props.comment);
    this.createdAt = new Date(props.createdAt);
  }

  static create(props: RatingProps): Rating {
    return new Rating(props);
  }

  static rehydrate(props: RatingProps): Rating {
    return new Rating(props);
  }
}

/** Trimmed, `null` when empty; throws when longer than allowed. */
export function normalizeRatingComment(raw?: string | null): string | null {
  const comment = raw?.trim() ?? '';
  if (comment === '') return null;
  if (comment.length > MAX_RATING_COMMENT_LENGTH) throw new Error(`Rating: comment must have at most ${MAX_RATING_COMMENT_LENGTH} characters`);
  return comment;
}

export type RatingWindow = { ok: true; dueUntil: Date } | { ok: false; reason: 'not_finished' | 'expired' | 'no_goalkeeper' };

/**
 * Whether this side can rate the booking now (FR-003, FR-004, FR-006): the client from the
 * check-in (or the end), the goalkeeper once completed; both until 7 days after the end.
 */
export function ratingWindowFor(booking: Booking, side: RatingSide, now: Date): RatingWindow {
  const held = booking.status === 'completed' || booking.status === 'assigned';
  if (!held || !booking.goalkeeperId) return { ok: false, reason: 'no_goalkeeper' };
  const dueUntil = new Date(booking.endsAt.getTime() + RATING_DAYS * 86_400_000);
  if (now.getTime() > dueUntil.getTime()) return { ok: false, reason: 'expired' };
  const open = booking.status === 'completed' || (side === 'client' && booking.checkIn !== null);
  if (!open) return { ok: false, reason: 'not_finished' };
  return { ok: true, dueUntil };
}
