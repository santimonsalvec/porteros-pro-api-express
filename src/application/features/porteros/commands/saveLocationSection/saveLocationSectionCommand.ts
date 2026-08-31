import { ICommand } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export type SaveLocationSectionOutcome = 'success' | 'validation_failed' | 'already_active';

export interface SaveLocationSectionResult {
  outcome: SaveLocationSectionOutcome;
  registration?: PorteroRegistrationResponse;
  fieldErrors?: Record<string, string>;
}

export class SaveLocationSectionCommand extends ICommand<SaveLocationSectionResult> {
  constructor(
    public readonly userId: string,
    public readonly latitude?: number,
    public readonly longitude?: number,
    public readonly city?: string,
    public readonly state?: string,
    public readonly country?: string,
    public readonly neighborhood?: string,
    public readonly formattedAddress?: string,
  ) {
    super();
  }
}
