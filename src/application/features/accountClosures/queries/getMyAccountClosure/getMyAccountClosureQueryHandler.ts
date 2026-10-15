import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { balanceStateOf, roleOf, type AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { toMyClosureView, toPreview } from '../../common/closureViews.js';
import type { AssignedBookingBlocker } from '../../common/ports.js';
import { GetMyAccountClosureQuery, type GetMyAccountClosureResult } from './getMyAccountClosureQuery.js';

export class GetMyAccountClosureQueryHandler implements IQueryHandler<GetMyAccountClosureQuery, GetMyAccountClosureResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle({ userId }: GetMyAccountClosureQuery): Promise<GetMyAccountClosureResult> {
    const open = await this.deps.closures.findOpenByUserId(userId);
    const role = open?.role ?? (await roleOf(this.deps, userId));
    const state = await balanceStateOf(this.deps, userId, role);
    if (open) {
      const debt = state.balance !== null && state.balance < 0 ? -state.balance : null;
      const suggested = debt === null ? null : await this.deps.suggestDepositAmount(userId, debt);
      return { outcome: 'ok', current: toMyClosureView(open, state, suggested), preview: null };
    }
    const blockers = (await this.deps.blockers.forUser(userId, role)).filter(
      (blocker): blocker is AssignedBookingBlocker => blocker.code === 'assigned_bookings',
    );
    return { outcome: 'ok', current: null, preview: toPreview(state, blockers) };
  }
}
