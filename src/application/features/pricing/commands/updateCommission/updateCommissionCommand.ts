import { ICommand } from '../../../../common/mediator/types.js';

export interface UpdateCommissionInput {
  fixedAmount: number;
  percentBps: number;
  /** Goalkeeper rules only: a new expiry (`YYYY-MM-DDTHH:mm`, market time zone), `null` = never; absent = unchanged. */
  validUntilLocal?: string | null;
}

export type UpdateCommissionResult =
  | { outcome: 'saved'; commissionId: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'not_found' }
  | { outcome: 'stale' };

/** Changes a rule's components (and a goalkeeper rule's validity); it applies to quotes and acceptances made afterwards, never to bookings already made. */
export class UpdateCommissionCommand extends ICommand<UpdateCommissionResult> {
  constructor(
    readonly commissionId: string,
    readonly revision: number,
    readonly input: UpdateCommissionInput,
  ) {
    super();
  }
}
