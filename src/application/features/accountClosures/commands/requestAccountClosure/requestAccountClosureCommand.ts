import { ICommand } from '../../../../common/mediator/types.js';
import type { MyClosureView } from '../../common/closureViews.js';
import type { AssignedBookingBlocker } from '../../common/ports.js';

export type RequestAccountClosureResult =
  | { outcome: 'requested'; current: MyClosureView }
  | { outcome: 'blocked'; blockers: AssignedBookingBlocker[] }
  | { outcome: 'already_open'; current: MyClosureView };

/** A user asks to leave: the account becomes inactive until an administrator closes it (feature 029). */
export class RequestAccountClosureCommand extends ICommand<RequestAccountClosureResult> {
  constructor(readonly userId: string) {
    super();
  }
}
