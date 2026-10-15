import type { AccountClosure, ClosureAction } from '../../../../domain/accountClosures/accountClosure.js';
import type { ClosureBlocker } from './ports.js';

export interface ClosureUserRef {
  userId: string;
  name: string | null;
  email: string | null;
  role: AccountClosure['role'];
}

/** A row of the administrators' list (contracts/account-closure-api.md). */
export interface ClosureListItem {
  closureId: string;
  status: AccountClosure['status'];
  requestedAt: string;
  user: ClosureUserRef;
  /** The balance when it was requested. */
  balanceAtRequest: number | null;
  currency: string | null;
  hasDebt: boolean;
  debtResolution: AccountClosure['debtResolution'];
}

export interface ClosureTimelineEntry {
  action: string;
  at: string;
  by: string | null;
  note: string | null;
}

/** The administrators' detail (contracts/account-closure-api.md `Detail`). */
export interface ClosureDetail extends ClosureListItem {
  /** The balance now. */
  balance: number | null;
  refundAmount: number | null;
  debtReason: string | null;
  blockers: ClosureBlocker[];
  refund: { amount: number; reference: string | null; paidOn: string | null; note: string | null; recordedBy: string; recordedAt: string } | null;
  closedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  reopenedAt: string | null;
  timeline: ClosureTimelineEntry[];
  allowedActions: ClosureAction[];
}

export function toListItem(closure: AccountClosure, user: ClosureUserRef): ClosureListItem {
  return {
    closureId: closure.id,
    status: closure.status,
    requestedAt: closure.requestedAt.toISOString(),
    user,
    balanceAtRequest: closure.balanceAtRequest,
    currency: closure.currency,
    hasDebt: (closure.balanceAtRequest ?? 0) < 0,
    debtResolution: closure.debtResolution,
  };
}

/** What happened, in order, built from what the request keeps. */
export function timelineOf(closure: AccountClosure): ClosureTimelineEntry[] {
  const entries: ClosureTimelineEntry[] = [
    { action: 'requested', at: closure.requestedAt.toISOString(), by: closure.userId, note: null },
  ];
  const props = closure.toProps();
  if (props.debtResolution && props.debtResolvedAt) {
    entries.push({
      action: props.debtResolution === 'waived' ? 'debt_waived' : 'debt_deposit_required',
      at: props.debtResolvedAt.toISOString(),
      by: props.debtResolvedBy,
      note: props.debtReason,
    });
  }
  if (closure.refund) {
    entries.push({ action: 'refund_recorded', at: closure.refund.recordedAt.toISOString(), by: closure.refund.recordedBy, note: closure.refund.note });
  }
  if (closure.closedAt) entries.push({ action: 'closed', at: closure.closedAt.toISOString(), by: closure.closedBy, note: null });
  if (closure.reopenedAt) entries.push({ action: 'reopened', at: closure.reopenedAt.toISOString(), by: closure.userId, note: null });
  if (closure.endedAt && (closure.status === 'cancelled' || closure.status === 'rejected')) {
    entries.push({ action: closure.status, at: closure.endedAt.toISOString(), by: closure.endedBy, note: closure.endReason });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
