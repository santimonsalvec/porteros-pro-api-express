import type { AccountClosure } from '../../../../domain/accountClosures/accountClosure.js';
import type { AssignedBookingBlocker } from './ports.js';
import type { BalanceState } from './accountClosureDependencies.js';

/** What the status screen shows (contracts/account-closure-api.md `current`). */
export interface MyClosureView {
  closureId: string;
  status: AccountClosure['status'];
  requestedAt: string;
  /** The balance now; `null` for a client. */
  balance: number | null;
  currency: string | null;
  /** What would be (or was) returned. */
  refundAmount: number | null;
  debtResolution: AccountClosure['debtResolution'];
  /** What the balance owes, positive; `null` with no debt. */
  debtToCover: number | null;
  suggestedDepositAmount: number | null;
  refund: { amount: number; reference: string | null; paidOn: string | null; recordedAt: string } | null;
}

/** What a user sees before asking to close (contract `preview`). */
export interface ClosurePreviewView {
  canRequest: boolean;
  balance: number | null;
  currency: string | null;
  refundAmount: number | null;
  hasDebt: boolean;
  blockers: AssignedBookingBlocker[];
}

export function toMyClosureView(closure: AccountClosure, state: BalanceState, suggestedDepositAmount: number | null): MyClosureView {
  const debt = state.balance !== null && state.balance < 0 ? -state.balance : null;
  const refund = closure.refund;
  return {
    closureId: closure.id,
    status: closure.status,
    requestedAt: closure.requestedAt.toISOString(),
    balance: state.balance,
    currency: state.currency ?? closure.currency,
    refundAmount: refund ? refund.amount : state.balance === null ? null : Math.max(state.balance, 0),
    debtResolution: closure.debtResolution,
    debtToCover: debt,
    suggestedDepositAmount: debt === null ? null : suggestedDepositAmount,
    refund: refund ? { amount: refund.amount, reference: refund.reference, paidOn: refund.paidOn, recordedAt: refund.recordedAt.toISOString() } : null,
  };
}

export function toPreview(state: BalanceState, blockers: AssignedBookingBlocker[]): ClosurePreviewView {
  return {
    canRequest: blockers.length === 0,
    balance: state.balance,
    currency: state.currency,
    refundAmount: state.balance === null ? null : Math.max(state.balance, 0),
    hasDebt: state.balance !== null && state.balance < 0,
    blockers,
  };
}
