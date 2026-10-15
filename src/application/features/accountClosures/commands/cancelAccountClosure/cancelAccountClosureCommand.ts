import { ICommand } from '../../../../common/mediator/types.js';
import type { MyClosureView } from '../../common/closureViews.js';

export type CancelAccountClosureResult =
  | { outcome: 'cancelled'; current: MyClosureView }
  | { outcome: 'not_found' }
  | { outcome: 'not_cancellable' };

/** The user withdraws the request, while the refund is not recorded (feature 029). */
export class CancelAccountClosureCommand extends ICommand<CancelAccountClosureResult> {
  constructor(readonly userId: string) {
    super();
  }
}
