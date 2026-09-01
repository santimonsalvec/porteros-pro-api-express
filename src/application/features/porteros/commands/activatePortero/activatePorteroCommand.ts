import { ICommand } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export type ActivatePorteroOutcome = 'success' | 'incomplete' | 'already_active';

export interface ActivatePorteroResult {
  outcome: ActivatePorteroOutcome;
  registration?: PorteroRegistrationResponse;
  missingSections?: string[];
}

export class ActivatePorteroCommand extends ICommand<ActivatePorteroResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
