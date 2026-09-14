import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type ActivateGoalkeeperOutcome = 'success' | 'incomplete' | 'already_active';

export interface ActivateGoalkeeperResult {
  outcome: ActivateGoalkeeperOutcome;
  registration?: GoalkeeperRegistrationResponse;
  missingSections?: string[];
}

export class ActivateGoalkeeperCommand extends ICommand<ActivateGoalkeeperResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
