import { ICommand } from '../../../../common/mediator/types.js';

export interface DeleteAllNotificationsResult {
  deleted: number;
}

/**
 * Empties the caller's inbox up to `before`, the newest entry they had on screen (feature 025), so
 * an entry that arrives while they clear it is kept.
 */
export class DeleteAllNotificationsCommand extends ICommand<DeleteAllNotificationsResult> {
  constructor(
    readonly userId: string,
    readonly before: Date,
  ) {
    super();
  }
}
