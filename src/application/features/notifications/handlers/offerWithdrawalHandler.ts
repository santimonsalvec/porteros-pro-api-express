import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import { offersChangedMessage } from '../../../../domain/notifications/offerMessages.js';
import type { IPushNotifier } from '../../devices/common/ports.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import type { INotificationRepository } from '../common/ports.js';

/** A match leaves the goalkeepers' available lists when it is taken, cancelled or expires. */
export const OFFER_WITHDRAWAL_EVENT_TYPES = ['goalkeeper.assigned', 'booking.cancelled', 'booking.expired'] as const;

export interface OfferWithdrawalDependencies {
  notifications: INotificationRepository;
  pushNotifier: IPushNotifier;
  processed: IProcessedEventStore;
  clock: IClock;
  logger: { info(fields: Record<string, unknown>, message: string): void };
}

/**
 * Tells the goalkeepers who were offered a match of the request, with a silent push, that it
 * changed, so their open app reloads "Partidos disponibles" and an offer no longer there goes
 * away. The goalkeeper who took it is left out: their own app already knows.
 */
export class OfferWithdrawalHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'offer-withdrawals';

  constructor(private readonly deps: OfferWithdrawalDependencies) {}

  async handle(event: DomainEvent): Promise<void> {
    await runOnce(this.deps.processed, this.deps.clock, this.name, event.id, () => this.notify(event));
  }

  private async notify(event: DomainEvent): Promise<void> {
    const taker = event.type === 'goalkeeper.assigned' ? (event.payload as { goalkeeperId: string }).goalkeeperId : null;
    const recipients = (await this.deps.notifications.findOfferRecipients(event.requestId)).filter((id) => id !== taker);
    if (recipients.length === 0) return;
    const result = await this.deps.pushNotifier.sendToUsers(recipients, offersChangedMessage(event.requestId));
    this.deps.logger.info(
      { outcome: 'offers_changed_sent', event: event.type, requestId: event.requestId, recipients: recipients.length, reached: result.totals.reached },
      'Offered goalkeepers told a match changed',
    );
  }
}
