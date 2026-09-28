import { ICommand } from '../../../../common/mediator/types.js';

export interface MarkNotificationReadResult {
  outcome: 'read' | 'not_found';
}

/** Marks one entry read; for an offer this also means "opened": no more reminders (FR-016). */
export class MarkNotificationReadCommand extends ICommand<MarkNotificationReadResult> {
  constructor(
    readonly userId: string,
    readonly notificationId: string,
  ) {
    super();
  }
}
