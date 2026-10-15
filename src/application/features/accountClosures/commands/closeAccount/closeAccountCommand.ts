import { ICommand } from '../../../../common/mediator/types.js';
import type { ClosureActionOutcome } from '../../common/closureAdminResults.js';

/** The logical deletion: the refund is recorded, the account is closed (feature 029, FR-025). */
export class CloseAccountCommand extends ICommand<ClosureActionOutcome> {
  constructor(
    readonly adminUserId: string,
    readonly closureId: string,
  ) {
    super();
  }
}
