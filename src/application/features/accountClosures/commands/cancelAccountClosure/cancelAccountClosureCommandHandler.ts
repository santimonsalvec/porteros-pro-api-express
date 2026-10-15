import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { balanceStateOf, type AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { toMyClosureView } from '../../common/closureViews.js';
import { CancelAccountClosureCommand, type CancelAccountClosureResult } from './cancelAccountClosureCommand.js';

export class CancelAccountClosureCommandHandler implements ICommandHandler<CancelAccountClosureCommand, CancelAccountClosureResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle({ userId }: CancelAccountClosureCommand): Promise<CancelAccountClosureResult> {
    const open = await this.deps.closures.findOpenByUserId(userId);
    if (!open) return { outcome: 'not_found' };
    const transition = open.cancel(this.deps.clock.now());
    if (!transition.ok) return { outcome: 'not_cancellable' };
    // Lost the race to an administrator who recorded the refund (or rejected) in between.
    if (!(await this.deps.closures.save(transition.closure, open.status))) return { outcome: 'not_cancellable' };
    const state = await balanceStateOf(this.deps, userId, open.role);
    return { outcome: 'cancelled', current: toMyClosureView(transition.closure, state, null) };
  }
}
