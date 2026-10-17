import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { AccountClosure } from '../../../../../domain/accountClosures/accountClosure.js';
import { closureRequestedMessage } from '../../../../../domain/notifications/accountClosureMessages.js';
import { notifyOnce } from '../../../bookingLifecycle/common/notifyOnce.js';
import { balanceStateOf, roleOf, type AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { toMyClosureView } from '../../common/closureViews.js';
import type { AssignedBookingBlocker } from '../../common/ports.js';
import { RequestAccountClosureCommand, type RequestAccountClosureResult } from './requestAccountClosureCommand.js';

/**
 * Refuses while the user has accepted matches to play (FR-029); otherwise records the request,
 * turns a goalkeeper's offers off and tells the user. Asking twice answers the open request.
 */
export class RequestAccountClosureCommandHandler implements ICommandHandler<RequestAccountClosureCommand, RequestAccountClosureResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle({ userId }: RequestAccountClosureCommand): Promise<RequestAccountClosureResult> {
    const role = await roleOf(this.deps, userId);
    const state = await balanceStateOf(this.deps, userId, role);

    const existing = await this.deps.closures.findOpenByUserId(userId);
    if (existing) return { outcome: 'already_open', current: toMyClosureView(existing, state, null) };

    const blockers = (await this.deps.blockers.forUser(userId, role)).filter(
      (blocker): blocker is AssignedBookingBlocker => blocker.code === 'assigned_bookings',
    );
    if (blockers.length > 0) return { outcome: 'blocked', blockers };

    const closure = AccountClosure.request({
      id: this.deps.idGenerator.newId(),
      userId,
      role,
      balanceAtRequest: state.balance,
      currency: state.currency,
      now: this.deps.clock.now(),
    });
    if ((await this.deps.closures.add(closure)) === 'already_open') {
      const raced = await this.deps.closures.findOpenByUserId(userId);
      return { outcome: 'already_open', current: toMyClosureView(raced ?? closure, state, null) };
    }

    if (role === 'goalkeeper') await this.deps.profiles.setAvailableForOffers(userId, false);
    await notifyOnce(this.deps.notices, {
      userId,
      message: (language) => closureRequestedMessage(language, closure.id),
      dedupeKey: `account-closure-requested:${closure.id}`,
    });
    return { outcome: 'requested', current: toMyClosureView(closure, state, null) };
  }
}
