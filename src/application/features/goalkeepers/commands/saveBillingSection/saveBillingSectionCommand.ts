import { ICommand } from '../../../../common/mediator/types.js';
import type { BillingData } from '../../../../../domain/goalkeepers/billing.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type SaveBillingSectionResult =
  | { outcome: 'success'; registration: GoalkeeperRegistrationResponse }
  | { outcome: 'validation_failed'; fieldErrors: Record<string, string> }
  | { outcome: 'invalid_city' }
  | { outcome: 'already_active' };

/** Saves the draft's billing data field by field, like the other sections (spec 031, contract A6). */
export class SaveBillingSectionCommand extends ICommand<SaveBillingSectionResult> {
  constructor(
    public readonly userId: string,
    public readonly fields: Partial<BillingData>,
  ) {
    super();
  }
}
