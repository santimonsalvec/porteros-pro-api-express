import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { closureReasonIssue } from '../../../../../domain/accountClosures/accountClosure.js';
import { closureRejectedMessage } from '../../../../../domain/notifications/accountClosureMessages.js';
import { notifyOnce } from '../../../bookingLifecycle/common/notifyOnce.js';
import type { AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { buildDetail, type ClosureActionOutcome } from '../../common/closureAdminResults.js';
import { RejectAccountClosureCommand } from './rejectAccountClosureCommand.js';

export class RejectAccountClosureCommandHandler implements ICommandHandler<RejectAccountClosureCommand, ClosureActionOutcome> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle(command: RejectAccountClosureCommand): Promise<ClosureActionOutcome> {
    const { deps } = this;
    const closure = await deps.closures.findById(command.closureId);
    if (!closure) return { outcome: 'not_found' };
    if (closure.status === 'rejected') return { outcome: 'replayed', detail: await buildDetail(deps, closure) };
    const issue = closureReasonIssue(command.reason);
    if (issue) return { outcome: 'validation_failed', fieldErrors: { reason: issue } };

    const transition = closure.reject({ by: command.adminUserId, reason: command.reason, now: deps.clock.now() });
    if (!transition.ok) return { outcome: 'invalid_transition' };
    if (!(await deps.closures.save(transition.closure, 'requested'))) return { outcome: 'invalid_transition' };

    await notifyOnce(deps.notices, {
      userId: closure.userId,
      message: (language) => closureRejectedMessage(language, command.reason.trim(), closure.id),
      dedupeKey: `account-closure-rejected:${closure.id}`,
    });
    return { outcome: 'ok', detail: await buildDetail(deps, transition.closure) };
  }
}
