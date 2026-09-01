import { ICommand } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export type SaveAvailabilitySectionOutcome = 'success' | 'validation_failed' | 'already_active';

export interface SaveAvailabilitySectionResult {
  outcome: SaveAvailabilitySectionOutcome;
  registration?: PorteroRegistrationResponse;
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
