import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type UpdateGoalkeeperAvailabilityOutcome =
  | 'success'
  | 'invalid_city'
  | 'invalid_zones'
  | 'not_a_goalkeeper'
  | 'not_active';

export interface UpdateGoalkeeperAvailabilityResult {
  outcome: UpdateGoalkeeperAvailabilityOutcome;
  goalkeeper?: GoalkeeperRegistrationResponse;
  invalidZoneIds?: string[];
}

/** Replaces an ALREADY ACTIVE goalkeeper's city and service zones together, in one write. */
export class UpdateGoalkeeperAvailabilityCommand extends ICommand<UpdateGoalkeeperAvailabilityResult> {
  constructor(
    public readonly userId: string,
    public readonly cityId: string,
    public readonly zoneIds: string[],
  ) {
    super();
  }
}
