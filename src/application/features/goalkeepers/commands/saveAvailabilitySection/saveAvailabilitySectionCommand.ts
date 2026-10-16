import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type SaveAvailabilitySectionOutcome = 'success' | 'invalid_market' | 'invalid_zones' | 'already_active';

export interface SaveAvailabilitySectionResult {
  outcome: SaveAvailabilitySectionOutcome;
  registration?: GoalkeeperRegistrationResponse;
  invalidZoneIds?: string[];
}

export class SaveAvailabilitySectionCommand extends ICommand<SaveAvailabilitySectionResult> {
  constructor(
    public readonly userId: string,
    public readonly marketId: string,
    public readonly zoneIds: string[],
  ) {
    super();
  }
}
