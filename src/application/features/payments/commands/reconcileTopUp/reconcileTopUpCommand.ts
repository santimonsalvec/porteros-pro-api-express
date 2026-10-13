import { ICommand } from '../../../../common/mediator/types.js';
import type { TopUp, TopUpCheckAnswer, TopUpStatus } from '../../../../../domain/payments/topUp.js';

export type ReconcileTopUpResult =
  /** The gateway was asked; `status` is the top-up's status afterwards. */
  | { outcome: 'reconciled'; answer: TopUpCheckAnswer; status: TopUpStatus; topUp: TopUp }
  /** Already approved, declined, voided or with an error: not asked again. */
  | { outcome: 'already_final'; topUp: TopUp }
  /** The gateway did not answer; the try is kept and the sweep carries on. */
  | { outcome: 'gateway_unavailable'; topUp: TopUp }
  /** Another ask (a member's or the sweep's) holds the top-up right now. */
  | { outcome: 'in_progress' }
  /** The gateway or its secrets are missing for the top-up's country: nothing was asked. */
  | { outcome: 'credentials_missing' }
  | { outcome: 'not_found' };

/** An administrator asks the gateway about a top-up now, without waiting for the sweep (admin spec 007, FR-006). */
export class ReconcileTopUpCommand extends ICommand<ReconcileTopUpResult> {
  constructor(
    public readonly staffUserId: string,
    public readonly topUpId: string,
  ) {
    super();
  }
}
