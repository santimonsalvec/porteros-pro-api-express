import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type UpdateGoalkeeperAvailabilityOutcome =
  | 'success'
  | 'invalid_market'
  | 'invalid_zones'
  /** Another market was sent: that is `POST /goalkeepers/me/market-change` (spec 031). */
  | 'use_market_change'
  | 'not_a_goalkeeper'
  | 'not_active';

export interface UpdateGoalkeeperAvailabilityResult {
  outcome: UpdateGoalkeeperAvailabilityOutcome;
  goalkeeper?: GoalkeeperRegistrationResponse;
  invalidZoneIds?: string[];
}

/**
 * Replaces an ALREADY ACTIVE goalkeeper's service zones within their current market (spec 031,
 * research §9). `marketId`, when sent, must be that market.
 */
export class UpdateGoalkeeperAvailabilityCommand extends ICommand<UpdateGoalkeeperAvailabilityResult> {
  constructor(
    public readonly userId: string,
    public readonly marketId: string | null,
    public readonly zoneIds: string[],
  ) {
    super();
  }
}
