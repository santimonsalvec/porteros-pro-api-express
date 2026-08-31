import { ICommand } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export type SavePhysicalDataSectionOutcome = 'success' | 'validation_failed' | 'already_active';

export interface SavePhysicalDataSectionResult {
  outcome: SavePhysicalDataSectionOutcome;
  registration?: PorteroRegistrationResponse;
  fieldErrors?: Record<string, string>;
}

export class SavePhysicalDataSectionCommand extends ICommand<SavePhysicalDataSectionResult> {
  constructor(
    public readonly userId: string,
    public readonly heightCm?: number,
    public readonly weightKg?: number,
  ) {
    super();
  }
}
