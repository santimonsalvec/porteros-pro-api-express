import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type UpdateGoalkeeperBillingResult =
  | { outcome: 'success'; goalkeeper: GoalkeeperRegistrationResponse }
  | { outcome: 'validation_failed'; fieldErrors: Record<string, string> }
  | { outcome: 'invalid_city' }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'not_active' };

/**
 * Replaces an ACTIVE goalkeeper's billing data (spec 031, contract A7). Invoices already issued
 * keep the address they were issued with.
 */
export class UpdateGoalkeeperBillingCommand extends ICommand<UpdateGoalkeeperBillingResult> {
  constructor(
    public readonly userId: string,
    public readonly fields: { cityId: string; address: string; addressComplement: string | null },
  ) {
    super();
  }
}
