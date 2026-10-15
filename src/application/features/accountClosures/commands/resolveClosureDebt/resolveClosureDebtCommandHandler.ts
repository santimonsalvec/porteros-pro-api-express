import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { closureReasonIssue } from '../../../../../domain/accountClosures/accountClosure.js';
import { closureDebtDepositMessage } from '../../../../../domain/notifications/accountClosureMessages.js';
import { notifyOnce } from '../../../bookingLifecycle/common/notifyOnce.js';
import { balanceStateOf, type AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { buildDetail } from '../../common/closureAdminResults.js';
import { ResolveClosureDebtCommand, type ResolveClosureDebtResult } from './resolveClosureDebtCommand.js';

export class ResolveClosureDebtCommandHandler implements ICommandHandler<ResolveClosureDebtCommand, ResolveClosureDebtResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle(command: ResolveClosureDebtCommand): Promise<ResolveClosureDebtResult> {
    const { deps } = this;
    const closure = await deps.closures.findById(command.closureId);
    if (!closure) return { outcome: 'not_found' };
    if (closure.debtResolution === command.resolution) return { outcome: 'replayed', detail: await buildDetail(deps, closure) };
    if (closure.status !== 'requested') return { outcome: 'invalid_transition' };

    const waived = command.resolution === 'waived';
    const reason = command.reason ?? '';
    if (waived && closureReasonIssue(reason)) {
      return { outcome: 'validation_failed', fieldErrors: { reason: closureReasonIssue(reason)! } };
    }

    const state = await balanceStateOf(deps, closure.userId, closure.role);
    // A waiver whose movement exists but whose status did not save: finish it with that amount.
    const prior = waived ? await deps.movements.findByCauseKey(`debt_waiver:${closure.id}`) : null;
    const balance = prior ? -prior.amount : (state.balance ?? 0);
    if (balance >= 0 || !state.owner) return { outcome: 'debt_not_applicable' };

    if (waived && !prior) {
      await deps.ledger.waiveDebt(state.owner, { closureId: closure.id, amount: -balance, reason, adminUserId: command.adminUserId });
    }
    const now = deps.clock.now();
    const transition = waived
      ? closure.waiveDebt({ by: command.adminUserId, reason, now, balance })
      : closure.requireDebtDeposit({ by: command.adminUserId, now, balance });
    if (!transition.ok) return { outcome: 'invalid_transition' };
    if (!(await deps.closures.save(transition.closure, 'requested'))) return { outcome: 'invalid_transition' };

    if (!waived && state.currency) {
      await notifyOnce(deps.notices, {
        userId: closure.userId,
        message: closureDebtDepositMessage(-balance, state.currency, closure.id),
        dedupeKey: `account-closure-debt-deposit:${closure.id}`,
      });
    }
    return { outcome: 'ok', detail: await buildDetail(deps, transition.closure) };
  }
}
