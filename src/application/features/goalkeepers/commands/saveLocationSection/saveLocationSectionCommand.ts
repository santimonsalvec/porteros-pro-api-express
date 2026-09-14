import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type SaveLocationSectionOutcome = 'success' | 'validation_failed' | 'already_active';

export interface SaveLocationSectionResult {
  outcome: SaveLocationSectionOutcome;
  registration?: GoalkeeperRegistrationResponse;
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
