import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { DismissOutcome, INotificationRepository } from '../../common/ports.js';
import { DismissOfferCommand } from './dismissOfferCommand.js';

/** Idempotent. Only offers can be dismissed; the match stays in "available matches". */
export class DismissOfferCommandHandler implements ICommandHandler<DismissOfferCommand, { outcome: DismissOutcome }> {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly clock: IClock,
  ) {}

  async handle(command: DismissOfferCommand): Promise<{ outcome: DismissOutcome }> {
    return { outcome: await this.notifications.dismissOffer(command.notificationId, command.userId, this.clock.now()) };
  }
}
