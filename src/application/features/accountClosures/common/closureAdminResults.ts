import type { AccountClosure } from '../../../../domain/accountClosures/accountClosure.js';
import { toListItem, timelineOf, type ClosureDetail } from './adminClosureViews.js';
import { closureUsers, currentSituation } from './closureAdminSupport.js';
import type { AccountClosureDependencies } from './accountClosureDependencies.js';

/** What every administrator action on a closure answers when it goes through (or was already done). */
export type ClosureActionOutcome =
  | { outcome: 'ok' | 'replayed'; detail: ClosureDetail }
  | { outcome: 'not_found' }
  | { outcome: 'invalid_transition' }
  | { outcome: 'validation_failed'; fieldErrors: Record<string, string> };

/** The detail an administrator sees, with the situation right now. */
export async function buildDetail(deps: AccountClosureDependencies, closure: AccountClosure): Promise<ClosureDetail> {
  const [userOf, situation] = await Promise.all([closureUsers(deps, [closure]), currentSituation(deps, closure)]);
  const { state, blockers, allowedActions } = situation;
  const refund = closure.refund;
  return {
    ...toListItem(closure, userOf(closure)),
    balance: state.balance,
    currency: state.currency ?? closure.currency,
    refundAmount: refund ? refund.amount : state.balance === null ? null : Math.max(state.balance, 0),
    debtReason: closure.debtReason,
    blockers,
    refund: refund
      ? {
          amount: refund.amount,
          reference: refund.reference,
          paidOn: refund.paidOn,
          note: refund.note,
          recordedBy: refund.recordedBy,
          recordedAt: refund.recordedAt.toISOString(),
        }
      : null,
    closedAt: closure.closedAt?.toISOString() ?? null,
    endedAt: closure.endedAt?.toISOString() ?? null,
    endReason: closure.endReason,
    reopenedAt: closure.reopenedAt?.toISOString() ?? null,
    timeline: timelineOf(closure),
    allowedActions,
  };
}
