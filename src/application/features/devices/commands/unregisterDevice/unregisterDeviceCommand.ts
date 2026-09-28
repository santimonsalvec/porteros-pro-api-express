import { ICommand } from '../../../../common/mediator/types.js';

export interface UnregisterDeviceResult {
  outcome: 'removed' | 'not_found' | 'invalid_token';
}

/** The app forgets its token before signing out (FR-007). */
export class UnregisterDeviceCommand extends ICommand<UnregisterDeviceResult> {
  constructor(
    readonly userId: string,
    readonly token: string,
  ) {
    super();
  }
}
