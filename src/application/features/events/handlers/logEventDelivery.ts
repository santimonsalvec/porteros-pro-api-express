import type { IClock } from '../../../common/clock.js';
import type { INotificationHandler } from '../../../common/mediator/types.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import type { IEventDeliveryLog, IEventLogger, IProcessedEventStore } from '../common/ports.js';
import { runOnce } from '../common/runOnce.js';

/** Event types the delivery log listens to. */
export const DELIVERY_LOG_EVENT_TYPES = [
  'booking.created',
  'goalkeeper.assigned',
  'booking.expired',
  'booking.cancelled',
  'goalkeeper.withdrew',
  'goalkeeper.checked_in',
  'booking.completed',
  'goalkeeper.no_show',
] as const;

/**
 * The example consumer (FR-016): records each event it receives once, proving the chain from the
 * change to a consumer works end to end. Its effect is keyed by the event id, so even two
 * simultaneous deliveries leave one entry.
 */
export class LogEventDeliveryHandler implements INotificationHandler<DomainEvent> {
  readonly name = 'delivery-log';

  constructor(
    private readonly deliveryLog: IEventDeliveryLog,
    private readonly processed: IProcessedEventStore,
    private readonly clock: IClock,
    private readonly logger: IEventLogger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const outcome = await runOnce(this.processed, this.clock, this.name, event.id, async () => {
      await this.deliveryLog.record(event, this.clock.now());
    });
    this.logger.info({ outcome: 'event_delivered', eventId: event.id, type: event.type, result: outcome }, 'Domain event delivered');
  }
}
