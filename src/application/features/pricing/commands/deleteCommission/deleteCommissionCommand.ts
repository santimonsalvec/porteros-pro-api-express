import { ICommand } from '../../../../common/mediator/types.js';
import type { DeletePriceResult } from '../deleteRentalRate/deleteRentalRateCommand.js';

/** Deletes a commission; the route asks for the reason, which goes to the audit log (FR-018). */
export class DeleteCommissionCommand extends ICommand<DeletePriceResult> {
  constructor(readonly commissionId: string) {
    super();
  }
}
