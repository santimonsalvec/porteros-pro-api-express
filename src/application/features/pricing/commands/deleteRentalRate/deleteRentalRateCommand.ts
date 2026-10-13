import { ICommand } from '../../../../common/mediator/types.js';

export type DeletePriceResult = { outcome: 'deleted' } | { outcome: 'not_found' };

/** Deletes a rate; the route asks for the reason, which goes to the audit log (FR-018). */
export class DeleteRentalRateCommand extends ICommand<DeletePriceResult> {
  constructor(readonly rateId: string) {
    super();
  }
}
