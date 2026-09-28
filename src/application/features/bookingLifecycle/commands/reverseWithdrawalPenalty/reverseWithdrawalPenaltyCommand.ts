import { ICommand } from '../../../../common/mediator/types.js';
import type { WithdrawalItem } from '../../common/withdrawalResponses.js';

export type ReverseWithdrawalPenaltyResult =
  /** Reversed now, or nothing left to reverse (idempotent): the withdrawal as it is now. */
  | { outcome: 'reversed' | 'replayed'; withdrawal: WithdrawalItem; suspendedUntil: string | null }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'withdrawal_not_found' }
  /** A reason of 3–500 characters and at least one action are required. */
  | { outcome: 'invalid_request'; errors: Record<string, string> }
  | { outcome: 'wallet_not_configured'; cityId: string }
  /** The booking has no commission charge to give back (data problem): nothing changed. */
  | { outcome: 'missing_charge'; bookingId: string };

/**
 * An administrator reverses a withdrawal's penalty (feature 018): the money (the booking's
 * commission, refunded once) and/or the suspensions, with a mandatory reason.
 */
export class ReverseWithdrawalPenaltyCommand extends ICommand<ReverseWithdrawalPenaltyResult> {
  constructor(
    readonly adminId: string,
    readonly goalkeeperId: string,
    readonly withdrawalId: string,
    readonly refund: boolean,
    readonly liftSuspension: boolean,
    readonly reason: string,
  ) {
    super();
  }
}
