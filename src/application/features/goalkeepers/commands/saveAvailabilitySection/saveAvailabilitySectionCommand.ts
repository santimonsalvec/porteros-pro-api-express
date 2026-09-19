import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type SaveAvailabilitySectionOutcome = 'success' | 'invalid_city' | 'invalid_zones' | 'already_active';

export interface SaveAvailabilitySectionResult {
  outcome: SaveAvailabilitySectionOutcome;
  registration?: GoalkeeperRegistrationResponse;
  invalidZoneIds?: string[];
}

export class SaveAvailabilitySectionCommand extends ICommand<SaveAvailabilitySectionResult> {
  constructor(
    public readonly userId: string,
    public readonly cityId: string,
    public readonly zoneIds: string[],
  ) {
    super();
  }
}
