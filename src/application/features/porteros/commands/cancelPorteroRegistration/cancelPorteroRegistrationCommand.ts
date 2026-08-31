import { ICommand } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export type CancelPorteroRegistrationOutcome = 'success' | 'already_active';

export interface CancelPorteroRegistrationResult {
  outcome: CancelPorteroRegistrationOutcome;
  registration?: PorteroRegistrationResponse;
}

export class CancelPorteroRegistrationCommand extends ICommand<CancelPorteroRegistrationResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
