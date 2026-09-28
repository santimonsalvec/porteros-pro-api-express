import type { IPublisher } from '../../application/common/mediator/types.js';
import type { IEventPublisher } from '../../application/features/events/common/ports.js';
import type { DomainEvent } from '../../domain/events/domainEvent.js';

/**
 * Local mode (research §8): delivers each event straight to the subscribed handlers, with the
 * same consumers and idempotency as production. A handler failure rejects, so the event stays
 * pending and the local sweep retries it — the same recovery path as a Pub/Sub failure.
 */
export class InProcessEventPublisher implements IEventPublisher {
  constructor(private readonly publisher: IPublisher) {}

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publisher.publish(event);
    }
  }
}
