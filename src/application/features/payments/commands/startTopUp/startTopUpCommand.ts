import { ICommand } from '../../../../common/mediator/types.js';
import type { TopUpResponse } from '../../common/topUpResponses.js';

export type StartTopUpResult =
  | { outcome: 'started'; topUp: TopUpResponse; checkoutUrl: string }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'wallet_not_configured'; cityId: string }
  | { outcome: 'invalid_amount'; amounts: number[] }
  | { outcome: 'terms_not_accepted'; termsVersion: string }
  | { outcome: 'top_ups_unavailable' }
  | { outcome: 'gateway_unavailable' };

/** A goalkeeper starts a top-up of one of their country's amounts (contracts §2). */
export class StartTopUpCommand extends ICommand<StartTopUpResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly amount: number,
  ) {
    super();
  }
}
