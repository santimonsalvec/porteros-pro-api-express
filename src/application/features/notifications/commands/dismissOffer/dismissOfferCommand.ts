import { ICommand } from '../../../../common/mediator/types.js';
import type { DismissOutcome } from '../../common/ports.js';

/** "Not interested": the offer is never reminded again, and is marked read (FR-017). */
export class DismissOfferCommand extends ICommand<{ outcome: DismissOutcome }> {
  constructor(
    readonly userId: string,
    readonly notificationId: string,
  ) {
    super();
  }
}
