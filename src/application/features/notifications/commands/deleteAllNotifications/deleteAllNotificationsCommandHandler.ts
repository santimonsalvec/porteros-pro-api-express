import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { INotificationRepository } from '../../common/ports.js';
import { DeleteAllNotificationsCommand, type DeleteAllNotificationsResult } from './deleteAllNotificationsCommand.js';

export class DeleteAllNotificationsCommandHandler implements ICommandHandler<DeleteAllNotificationsCommand, DeleteAllNotificationsResult> {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly clock: IClock,
  ) {}

  async handle(command: DeleteAllNotificationsCommand): Promise<DeleteAllNotificationsResult> {
    const deleted = await this.notifications.deleteAllForUser(command.userId, command.before, this.clock.now());
    return { deleted };
  }
}
