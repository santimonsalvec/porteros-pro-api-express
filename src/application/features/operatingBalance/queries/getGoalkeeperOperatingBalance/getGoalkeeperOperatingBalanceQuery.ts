import { IQuery } from '../../../../common/mediator/types.js';
import type { OperatingBalanceViewResponse } from '../../common/operatingBalanceResponses.js';

export type GetGoalkeeperOperatingBalanceResult =
  | {
      outcome: 'success';
      operatingBalance: OperatingBalanceViewResponse;
      /** Enabled zones with no commission configured — logged, never serialized (FR-010). */
      unconfiguredZoneIds: string[];
    }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'operating_balance_not_configured'; marketId: string };

/** A goalkeeper's balance, currency and offers status (the goalkeeper's own, or read by an admin). */
export class GetGoalkeeperOperatingBalanceQuery extends IQuery<GetGoalkeeperOperatingBalanceResult> {
  constructor(public readonly goalkeeperId: string) {
    super();
  }
}
