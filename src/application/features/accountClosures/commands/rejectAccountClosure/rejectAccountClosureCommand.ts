import { ICommand } from '../../../../common/mediator/types.js';
import type { ClosureActionOutcome } from '../../common/closureAdminResults.js';

/** An administrator turns the request down: the account is active again (feature 029). */
export class RejectAccountClosureCommand extends ICommand<ClosureActionOutcome> {
  constructor(
    readonly adminUserId: string,
    readonly closureId: string,
    readonly reason: string,
  ) {
    super();
  }
}
