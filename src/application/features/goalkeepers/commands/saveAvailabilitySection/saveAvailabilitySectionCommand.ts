import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type SaveAvailabilitySectionOutcome = 'success' | 'validation_failed' | 'already_active';

export interface SaveAvailabilitySectionResult {
  outcome: SaveAvailabilitySectionOutcome;
  registration?: GoalkeeperRegistrationResponse;
  fieldErrors?: Record<string, string>;
}

export class SaveAvailabilitySectionCommand extends ICommand<SaveAvailabilitySectionResult> {
  constructor(
    public readonly userId: string,
    public readonly radiusKm?: number,
  ) {
    super();
  }
}
