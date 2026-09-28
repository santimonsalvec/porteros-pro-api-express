import { ICommand } from '../../../../common/mediator/types.js';

/** Marks every unread entry of the caller read (FR-016). */
export class MarkAllNotificationsReadCommand extends ICommand<{ outcome: 'done' }> {
  constructor(readonly userId: string) {
    super();
  }
}
