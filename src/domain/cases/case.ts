import { Entity } from '../common/entity.js';
import type { CheckIn } from '../bookings/booking.js';

/** Why operations must look at a booking (feature 021). */
export type CaseType = 'goalkeeper_no_show' | 'payment_not_received' | 'late_attendance_claim';
export type CaseStatus = 'open' | 'resolved';

export interface CaseResolution {
  by: string;
  at: Date;
  note: string;
}

export interface SupportCaseProps {
  id: string;
  type: CaseType;
  bookingId: string;
  requestId: string;
  clientId: string;
  goalkeeperId: string;
  ratingId: string;
  checkIn: CheckIn | null;
  noShowIncidentId: string | null;
  status: CaseStatus;
  resolution: CaseResolution | null;
  createdAt: Date;
}

export const CASE_NOTE_MIN = 3;
export const CASE_NOTE_MAX = 500;

/** A dispute for manual review (a PQRS case): opened by a rating, resolved by an administrator. */
export class SupportCase extends Entity<string> {
  readonly type: CaseType;
  readonly bookingId: string;
  readonly requestId: string;
  readonly clientId: string;
  readonly goalkeeperId: string;
  readonly ratingId: string;
  readonly checkIn: CheckIn | null;
  readonly noShowIncidentId: string | null;
  readonly status: CaseStatus;
  readonly resolution: CaseResolution | null;
  readonly createdAt: Date;

  private constructor(props: SupportCaseProps) {
    super(props.id);
    this.type = props.type;
    this.bookingId = props.bookingId;
    this.requestId = props.requestId;
    this.clientId = props.clientId;
    this.goalkeeperId = props.goalkeeperId;
    this.ratingId = props.ratingId;
    this.checkIn = props.checkIn;
    this.noShowIncidentId = props.noShowIncidentId;
    this.status = props.status;
    this.resolution = props.resolution;
    this.createdAt = new Date(props.createdAt);
  }

  static open(props: Omit<SupportCaseProps, 'status' | 'resolution'>): SupportCase {
    return new SupportCase({ ...props, status: 'open', resolution: null });
  }

  static rehydrate(props: SupportCaseProps): SupportCase {
    return new SupportCase(props);
  }

  /** The case closed by an administrator with a note (3–500 characters). */
  resolve(decision: CaseResolution): SupportCase {
    if (this.status === 'resolved') throw new Error(`Case ${this.id} is already resolved`);
    const note = normalizeCaseNote(decision.note);
    return new SupportCase({ ...this, status: 'resolved', resolution: { ...decision, note } });
  }
}

/** Trimmed; throws unless 3–500 characters. */
export function normalizeCaseNote(raw: string): string {
  const note = raw.trim();
  if (note.length < CASE_NOTE_MIN || note.length > CASE_NOTE_MAX) {
    throw new Error(`Case note must have between ${CASE_NOTE_MIN} and ${CASE_NOTE_MAX} characters`);
  }
  return note;
}
