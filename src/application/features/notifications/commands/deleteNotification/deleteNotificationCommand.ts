import { ICommand } from '../../../../common/mediator/types.js';

export interface DeleteNotificationResult {
  outcome: 'deleted' | 'not_found';
}

/**
 * Removes one entry from the caller's inbox (feature 025). The delete is logical: the entry stays
 * stored, so it still dedupes and is never pushed again; an offer also stops being reminded.
 */
export class DeleteNotificationCommand extends ICommand<DeleteNotificationResult> {
  constructor(
    readonly userId: string,
    readonly notificationId: string,
  ) {
    super();
  }
}
