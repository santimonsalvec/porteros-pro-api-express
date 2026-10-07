import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { INotificationRepository } from '../../common/ports.js';
import { DeleteNotificationCommand, type DeleteNotificationResult } from './deleteNotificationCommand.js';

/** Idempotent; someone else's or an unknown entry is `not_found` (FR-018 of feature 015). */
export class DeleteNotificationCommandHandler implements ICommandHandler<DeleteNotificationCommand, DeleteNotificationResult> {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly clock: IClock,
  ) {}

  async handle(command: DeleteNotificationCommand): Promise<DeleteNotificationResult> {
    const found = await this.notifications.deleteForUser(command.notificationId, command.userId, this.clock.now());
    return { outcome: found ? 'deleted' : 'not_found' };
  }
}
