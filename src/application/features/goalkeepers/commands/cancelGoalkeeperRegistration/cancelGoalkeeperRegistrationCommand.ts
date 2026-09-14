import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type CancelGoalkeeperRegistrationOutcome = 'success' | 'already_active';

export interface CancelGoalkeeperRegistrationResult {
  outcome: CancelGoalkeeperRegistrationOutcome;
  registration?: GoalkeeperRegistrationResponse;
}

export class CancelGoalkeeperRegistrationCommand extends ICommand<CancelGoalkeeperRegistrationResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
