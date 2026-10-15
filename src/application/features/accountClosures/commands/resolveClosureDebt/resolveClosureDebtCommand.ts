import { ICommand } from '../../../../common/mediator/types.js';
import type { ClosureActionOutcome } from '../../common/closureAdminResults.js';

export type ResolveClosureDebtResult = ClosureActionOutcome | { outcome: 'debt_not_applicable' };

/** An administrator decides how a closing account's debt is settled (feature 029, FR-030). */
export class ResolveClosureDebtCommand extends ICommand<ResolveClosureDebtResult> {
  constructor(
    readonly adminUserId: string,
    readonly closureId: string,
    readonly resolution: 'deposit_required' | 'waived',
    /** Required to waive: 3 to 300 characters. */
    readonly reason: string | null,
  ) {
    super();
  }
}
