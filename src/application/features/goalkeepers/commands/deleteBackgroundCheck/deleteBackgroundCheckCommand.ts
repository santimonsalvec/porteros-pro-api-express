import { ICommand } from '../../../../common/mediator/types.js';

export type DeleteBackgroundCheckResult = { outcome: 'deleted' } | { outcome: 'reviewed' } | { outcome: 'not_found' };

/** The goalkeeper removes a background check the team has not reviewed yet (contracts A4). */
export class DeleteBackgroundCheckCommand extends ICommand<DeleteBackgroundCheckResult> {
  constructor(
    public readonly userId: string,
    public readonly checkId: string,
  ) {
    super();
  }
}
