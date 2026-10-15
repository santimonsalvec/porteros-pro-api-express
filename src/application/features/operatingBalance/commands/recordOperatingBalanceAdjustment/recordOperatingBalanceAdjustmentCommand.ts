import { ICommand } from '../../../../common/mediator/types.js';
import type { AdminMovementItemResponse } from '../../common/operatingBalanceResponses.js';

export type RecordOperatingBalanceAdjustmentResult =
  /** Recorded now. */
  | { outcome: 'recorded'; movement: AdminMovementItemResponse; balance: number }
  /** The operation key was already recorded: the original movement, nothing new. */
  | { outcome: 'replayed'; movement: AdminMovementItemResponse; balance: number }
  /** A debit would leave the balance below zero (only penalties may). */
  | { outcome: 'insufficient_funds'; balance: number }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'operating_balance_not_configured'; cityId: string };

/** An administrator credits or debits a goalkeeper's operating balance by hand, with a reason (FR-017). */
export class RecordOperatingBalanceAdjustmentCommand extends ICommand<RecordOperatingBalanceAdjustmentResult> {
  constructor(
    public readonly adminUserId: string,
    public readonly goalkeeperId: string,
    public readonly amount: number,
    public readonly reason: string,
    public readonly operationKey: string,
  ) {
    super();
  }
}
