import { ICommand } from '../../../../common/mediator/types.js';
import type { AdminMovementItemResponse } from '../../common/walletResponses.js';

export type RecordWalletAdjustmentResult =
  /** Recorded now. */
  | { outcome: 'recorded'; movement: AdminMovementItemResponse; balance: number }
  /** The operation key was already recorded: the original movement, nothing new. */
  | { outcome: 'replayed'; movement: AdminMovementItemResponse; balance: number }
  /** A debit would leave the balance below zero (only penalties may). */
  | { outcome: 'insufficient_funds'; balance: number }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'wallet_not_configured'; cityId: string };

/** An administrator credits or debits a goalkeeper's wallet by hand, with a reason (FR-017). */
export class RecordWalletAdjustmentCommand extends ICommand<RecordWalletAdjustmentResult> {
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
