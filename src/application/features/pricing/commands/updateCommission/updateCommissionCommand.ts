import { ICommand } from '../../../../common/mediator/types.js';

export type UpdateCommissionResult =
  | { outcome: 'saved'; commissionId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'not_found' }
  | { outcome: 'stale' };

/** Changes a commission's amount; it applies to quotes made afterwards, never to bookings already made. */
export class UpdateCommissionCommand extends ICommand<UpdateCommissionResult> {
  constructor(
    readonly commissionId: string,
    readonly revision: number,
    readonly amount: number,
  ) {
    super();
  }
}
