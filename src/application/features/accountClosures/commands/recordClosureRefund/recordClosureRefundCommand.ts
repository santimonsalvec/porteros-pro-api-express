import { ICommand } from '../../../../common/mediator/types.js';
import type { ClosureBlocker } from '../../common/ports.js';
import type { ClosureActionOutcome } from '../../common/closureAdminResults.js';

export type RecordClosureRefundResult =
  | ClosureActionOutcome
  | { outcome: 'refund_amount_mismatch'; balance: number }
  | { outcome: 'debt_pending'; balance: number }
  | { outcome: 'closure_blockers_pending'; blockers: ClosureBlocker[] };

/** An administrator records what was returned to the user: the whole balance, with its proof (feature 029). */
export class RecordClosureRefundCommand extends ICommand<RecordClosureRefundResult> {
  constructor(
    readonly adminUserId: string,
    readonly closureId: string,
    readonly amount: number,
    /** The transfer's proof; required when `amount > 0`. */
    readonly reference: string | null,
    /** `YYYY-MM-DD`; required when `amount > 0`. */
    readonly paidOn: string | null,
    readonly note: string | null,
  ) {
    super();
  }
}
