import type { AdminDecision, GoalkeeperIncident, Penalty } from '../../../../domain/goalkeepers/goalkeeperIncident.js';

/** Who sees the history: the goalkeeper (no administrator ids) or an administrator. */
export type WithdrawalView = 'goalkeeper' | 'admin';

export interface DecisionItem {
  /** The administrator's user id; only in the admin view. */
  by?: string;
  at: string;
  reason: string;
}

export interface PenaltyItem {
  penaltyId: string;
  kind: Penalty['kind'];
  days: number;
  startsAt: string;
  endsAt: string;
  reversal: DecisionItem | null;
}

/** What the withdraw endpoint answers besides the booking (contracts/withdrawals.md §1). */
export interface WithdrawalSummary {
  withdrawalId: string;
  occurredAt: string;
  noticeMinutes: number;
  late: boolean;
  replacementCreated: boolean;
  penalties: PenaltyItem[];
  suspendedUntil: string | null;
}

/** One withdrawal in a history (contracts/withdrawals.md §2–§3). */
export interface WithdrawalItem {
  withdrawalId: string;
  /** A withdrawal (018) or a no-show (021). */
  kind: 'withdrawal' | 'no_show';
  bookingId: string;
  requestId: string;
  startsAt: string;
  occurredAt: string;
  noticeMinutes: number;
  late: boolean;
  reason: string | null;
  replacementCreated: boolean;
  penalties: PenaltyItem[];
  moneyReversal: (DecisionItem & { amount: number; currency: string }) | null;
  forgiven: boolean;
}

function decision(value: AdminDecision, view: WithdrawalView): DecisionItem {
  return { ...(view === 'admin' ? { by: value.by } : {}), at: value.at.toISOString(), reason: value.reason };
}

function penaltyItem(penalty: Penalty, view: WithdrawalView): PenaltyItem {
  return {
    penaltyId: penalty.id,
    kind: penalty.kind,
    days: penalty.days,
    startsAt: penalty.startsAt.toISOString(),
    endsAt: penalty.endsAt.toISOString(),
    reversal: penalty.reversal ? decision(penalty.reversal, view) : null,
  };
}

export function toWithdrawalSummary(incident: GoalkeeperIncident, suspendedUntil: Date | null): WithdrawalSummary {
  return {
    withdrawalId: incident.id,
    occurredAt: incident.occurredAt.toISOString(),
    noticeMinutes: incident.noticeMinutes,
    late: incident.late,
    replacementCreated: incident.replacementBookingId !== null,
    penalties: incident.penalties.map((penalty) => penaltyItem(penalty, 'goalkeeper')),
    suspendedUntil: suspendedUntil?.toISOString() ?? null,
  };
}

export function toWithdrawalItem(incident: GoalkeeperIncident, view: WithdrawalView): WithdrawalItem {
  const money = incident.moneyReversal;
  return {
    withdrawalId: incident.id,
    kind: incident.kind,
    bookingId: incident.bookingId,
    requestId: incident.requestId,
    startsAt: incident.startsAt.toISOString(),
    occurredAt: incident.occurredAt.toISOString(),
    noticeMinutes: incident.noticeMinutes,
    late: incident.late,
    reason: incident.reason,
    replacementCreated: incident.replacementBookingId !== null,
    penalties: incident.penalties.map((penalty) => penaltyItem(penalty, view)),
    moneyReversal: money ? { ...decision(money, view), amount: money.amount, currency: money.currency } : null,
    forgiven: incident.forgivenAt !== null,
  };
}
