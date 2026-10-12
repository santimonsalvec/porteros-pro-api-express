import { ICommand } from '../../../../common/mediator/types.js';

export type UpdatePriceResult =
  | { outcome: 'saved'; rateId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'not_found' }
  | { outcome: 'stale' };

/** Changes a rate's amount; what it prices (level, target, duration, tier) never changes (research §6). */
export class UpdateRentalRateCommand extends ICommand<UpdatePriceResult> {
  constructor(
    readonly rateId: string,
    readonly revision: number,
    readonly amount: number,
  ) {
    super();
  }
}
