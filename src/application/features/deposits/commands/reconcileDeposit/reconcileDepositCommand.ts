import { ICommand } from '../../../../common/mediator/types.js';
import type { Deposit, DepositCheckAnswer, DepositStatus } from '../../../../../domain/deposits/deposit.js';

export type ReconcileDepositResult =
  /** The gateway was asked; `status` is the deposit's status afterwards. */
  | { outcome: 'reconciled'; answer: DepositCheckAnswer; status: DepositStatus; deposit: Deposit }
  /** Already approved, declined, voided or with an error: not asked again. */
  | { outcome: 'already_final'; deposit: Deposit }
  /** The gateway did not answer; the try is kept and the sweep carries on. */
  | { outcome: 'gateway_unavailable'; deposit: Deposit }
  /** Another ask (a member's or the sweep's) holds the deposit right now. */
  | { outcome: 'in_progress' }
  /** The gateway or its secrets are missing for the deposit's country: nothing was asked. */
  | { outcome: 'credentials_missing' }
  | { outcome: 'not_found' };

/** An administrator asks the gateway about a deposit now, without waiting for the sweep (admin spec 007, FR-006). */
export class ReconcileDepositCommand extends ICommand<ReconcileDepositResult> {
  constructor(
    public readonly staffUserId: string,
    public readonly depositId: string,
  ) {
    super();
  }
}
