import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler, ISender } from '../../../common/mediator/types.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import type { IProcessedEventStore } from '../../events/common/ports.js';
import { runOnce } from '../../events/common/runOnce.js';
import { NotifyBookingOffersCommand } from '../commands/notifyBookingOffers/notifyBookingOffersCommand.js';

/** Event types that trigger a first notification. */
export const OFFER_EVENT_TYPES = ['booking.created'] as const;

/**
 * Consumer of "booking created" (feature 013). It only invokes the command, where eligibility
 * lives (spec input). A repeat is skipped by `runOnce`; a concurrent one is harmless because the
 * offer's unique index lets only one delivery create — and push — each offer.
 */
export class NotifyBookingOffersHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'goalkeeper-offers';

  constructor(
    private readonly sender: ISender,
    private readonly processed: IProcessedEventStore,
    private readonly clock: IClock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    await runOnce(this.processed, this.clock, this.name, event.id, async () => {
      await this.sender.send(new NotifyBookingOffersCommand(event.bookingId));
    });
  }
}
