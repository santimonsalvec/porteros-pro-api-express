import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { closureClosedMessage } from '../../../../../domain/notifications/accountClosureMessages.js';
import { notifyOnce } from '../../../bookingLifecycle/common/notifyOnce.js';
import type { AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { buildDetail, type ClosureActionOutcome } from '../../common/closureAdminResults.js';
import { CloseAccountCommand } from './closeAccountCommand.js';

/**
 * Closes the account: movements, invoices and audits stay (SC-009). The user is told first, while
 * their devices still exist; then the devices go, so no push reaches a closed account. Sessions end
 * because a refresh for a closed account is refused.
 */
export class CloseAccountCommandHandler implements ICommandHandler<CloseAccountCommand, ClosureActionOutcome> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle(command: CloseAccountCommand): Promise<ClosureActionOutcome> {
    const { deps } = this;
    const closure = await deps.closures.findById(command.closureId);
    if (!closure) return { outcome: 'not_found' };
    if (closure.status === 'closed') return { outcome: 'replayed', detail: await buildDetail(deps, closure) };

    const transition = closure.close({ by: command.adminUserId, now: deps.clock.now() });
    if (!transition.ok) return { outcome: 'invalid_transition' };
    if (!(await deps.closures.save(transition.closure, 'refund_recorded'))) return { outcome: 'invalid_transition' };

    await notifyOnce(deps.notices, {
      userId: closure.userId,
      message: closureClosedMessage(closure.id),
      dedupeKey: `account-closure-closed:${closure.id}`,
    });
    const devices = await deps.devices.findByUserIds([closure.userId]);
    if (devices.length > 0) await deps.devices.removeByTokens(devices.map((device) => device.token));
    return { outcome: 'ok', detail: await buildDetail(deps, transition.closure) };
  }
}
