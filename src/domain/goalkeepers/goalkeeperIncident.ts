import { Entity } from '../common/entity.js';
import type { PenaltyKind } from './penaltyPolicy.js';

/** 021 adds `'no_show'`. */
export type IncidentKind = 'withdrawal';

/** An administrator's decision (who, when, why). */
export interface AdminDecision {
  by: string;
  at: Date;
  reason: string;
}

export interface Penalty {
  id: string;
  kind: PenaltyKind;
  days: number;
  startsAt: Date;
  endsAt: Date;
  /** Lifted by an administrator. */
  reversal: AdminDecision | null;
}

/** The commission an administrator gave back for this incident. */
export interface MoneyReversal extends AdminDecision {
  amount: number;
  currency: string;
}

export interface GoalkeeperIncidentProps {
  id: string;
  kind: IncidentKind;
  goalkeeperId: string;
  bookingId: string;
  requestId: string;
  startsAt: Date;
  occurredAt: Date;
  noticeMinutes: number;
  late: boolean;
  reason: string | null;
  replacementBookingId: string | null;
  penalties: Penalty[];
  moneyReversal: MoneyReversal | null;
  forgivenAt: Date | null;
}

/**
 * One goalkeeper failing one booking (feature 018: a withdrawal) with the penalties it caused.
 * Once an administrator reverses anything of it, it's forgiven: it no longer counts toward the
 * weekly limit (clarification 2).
 */
export class GoalkeeperIncident extends Entity<string> {
  readonly kind: IncidentKind;
  readonly goalkeeperId: string;
  readonly bookingId: string;
  readonly requestId: string;
  readonly startsAt: Date;
  readonly occurredAt: Date;
  readonly noticeMinutes: number;
  readonly late: boolean;
  readonly reason: string | null;
  readonly replacementBookingId: string | null;
  readonly penalties: readonly Penalty[];
  readonly moneyReversal: MoneyReversal | null;
  readonly forgivenAt: Date | null;

  private constructor(props: GoalkeeperIncidentProps) {
    super(props.id);
    if (!Number.isInteger(props.noticeMinutes) || props.noticeMinutes < 0) {
      throw new Error('GoalkeeperIncident: noticeMinutes must be an integer of at least 0');
    }
    this.kind = props.kind;
    this.goalkeeperId = props.goalkeeperId;
    this.bookingId = props.bookingId;
    this.requestId = props.requestId;
    this.startsAt = new Date(props.startsAt);
    this.occurredAt = new Date(props.occurredAt);
    this.noticeMinutes = props.noticeMinutes;
    this.late = props.late;
    this.reason = props.reason;
    this.replacementBookingId = props.replacementBookingId;
    this.penalties = props.penalties.map((penalty) => ({ ...penalty }));
    this.moneyReversal = props.moneyReversal;
    this.forgivenAt = props.forgivenAt;
  }

  static rehydrate(props: GoalkeeperIncidentProps): GoalkeeperIncident {
    return new GoalkeeperIncident(props);
  }

  countsTowardLimit(): boolean {
    return this.forgivenAt === null;
  }

  /** The penalties still suspending the goalkeeper: not lifted, and not over yet. */
  penaltiesInForce(now: Date): Penalty[] {
    return this.penalties.filter((penalty) => penalty.reversal === null && penalty.endsAt.getTime() > now.getTime());
  }

  /**
   * The incident after an administrator's reversal: the money (when `refund` is given and not
   * yet reversed) and/or every penalty still unlifted. `changed` is false when there was nothing
   * left to reverse, so a repeat is a no-op.
   */
  reverse(decision: AdminDecision, what: { refund: { amount: number; currency: string } | null; liftSuspension: boolean }): {
    incident: GoalkeeperIncident;
    changed: boolean;
  } {
    const moneyReversal =
      what.refund && this.moneyReversal === null ? { ...decision, amount: what.refund.amount, currency: what.refund.currency } : this.moneyReversal;
    const penalties = what.liftSuspension
      ? this.penalties.map((penalty) => (penalty.reversal === null ? { ...penalty, reversal: { ...decision } } : penalty))
      : [...this.penalties];
    const changed = moneyReversal !== this.moneyReversal || penalties.some((penalty, index) => penalty !== this.penalties[index]);
    if (!changed) return { incident: this, changed: false };
    return {
      incident: new GoalkeeperIncident({ ...this, penalties, moneyReversal, forgivenAt: this.forgivenAt ?? decision.at }),
      changed: true,
    };
  }
}

/**
 * The goalkeeper's suspension end (FR-012): the latest end among the penalties in force, or
 * `null`. Never a sum.
 */
export function suspensionEndOf(incidents: readonly GoalkeeperIncident[], now: Date): Date | null {
  let latest: Date | null = null;
  for (const incident of incidents) {
    for (const penalty of incident.penaltiesInForce(now)) {
      if (!latest || penalty.endsAt > latest) latest = penalty.endsAt;
    }
  }
  return latest ? new Date(latest) : null;
}
