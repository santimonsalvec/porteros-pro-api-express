import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { INotificationRepository } from '../../common/ports.js';
import { MarkNotificationReadCommand, type MarkNotificationReadResult } from './markNotificationReadCommand.js';

/** Idempotent; someone else's or an unknown entry is `not_found` (FR-018). */
export class MarkNotificationReadCommandHandler implements ICommandHandler<MarkNotificationReadCommand, MarkNotificationReadResult> {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly clock: IClock,
  ) {}

  async handle(command: MarkNotificationReadCommand): Promise<MarkNotificationReadResult> {
    const found = await this.notifications.markRead(command.notificationId, command.userId, this.clock.now());
    return { outcome: found ? 'read' : 'not_found' };
  }
}
