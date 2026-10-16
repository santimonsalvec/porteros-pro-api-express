import { ICommand } from '../../../../common/mediator/types.js';
import type { DepositResponse } from '../../common/depositResponses.js';

export type StartDepositResult =
  | { outcome: 'started'; deposit: DepositResponse; checkoutUrl: string }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'operating_balance_not_configured'; marketId: string }
  | { outcome: 'invalid_amount'; amounts: number[] }
  | { outcome: 'terms_not_accepted'; termsVersion: string }
  | { outcome: 'deposits_unavailable' }
  | { outcome: 'gateway_unavailable' };

/** A goalkeeper starts a deposit of one of their country's amounts (contracts §2). */
export class StartDepositCommand extends ICommand<StartDepositResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly amount: number,
  ) {
    super();
  }
}
