import { IQuery } from '../../../../common/mediator/types.js';
import type { WalletViewResponse } from '../../common/walletResponses.js';

export type GetGoalkeeperWalletResult =
  | {
      outcome: 'success';
      wallet: WalletViewResponse;
      /** Enabled zones with no commission configured — logged, never serialized (FR-010). */
      unconfiguredZoneIds: string[];
    }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'wallet_not_configured'; cityId: string };

/** A goalkeeper's balance, currency and offers status (the goalkeeper's own, or read by an admin). */
export class GetGoalkeeperWalletQuery extends IQuery<GetGoalkeeperWalletResult> {
  constructor(public readonly goalkeeperId: string) {
    super();
  }
}
