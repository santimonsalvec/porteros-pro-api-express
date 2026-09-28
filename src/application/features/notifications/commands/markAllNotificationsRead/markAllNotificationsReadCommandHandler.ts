import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { INotificationRepository } from '../../common/ports.js';
import { MarkAllNotificationsReadCommand } from './markAllNotificationsReadCommand.js';

export class MarkAllNotificationsReadCommandHandler implements ICommandHandler<MarkAllNotificationsReadCommand, { outcome: 'done' }> {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly clock: IClock,
  ) {}

  async handle(command: MarkAllNotificationsReadCommand): Promise<{ outcome: 'done' }> {
    await this.notifications.markAllRead(command.userId, this.clock.now());
    return { outcome: 'done' };
  }
}
