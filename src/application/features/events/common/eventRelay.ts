import type { IClock } from '../../../common/clock.js';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';
import type { IEventLogger, IEventPublisher, IEventRelay, IOutboxStore } from './ports.js';

/**
 * Publishes the events an operation just recorded, before it responds (research §2). It gives
 * up after `timeoutMs` and never throws: an unpublished event stays pending, and the sweep
 * publishes it once the relay's lease expires (FR-007, FR-007a).
 */
export class EventRelay implements IEventRelay {
  constructor(
    private readonly publisher: IEventPublisher,
    private readonly outbox: IOutboxStore,
    private readonly clock: IClock,
    private readonly logger: IEventLogger,
    private readonly timeoutMs: number,
  ) {}

  async relay(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const context = { eventIds: events.map((event) => event.id), types: [...new Set(events.map((event) => event.type))] };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timeout');
      }, this.timeoutMs);
    });
    const work = this.publisher
      .publish(events, controller.signal)
      .then(() => this.outbox.markPublished(context.eventIds, this.clock.now()))
      .then(() => 'done' as const);

    try {
      const outcome = await Promise.race([work, timeout]);
      if (outcome === 'timeout') {
        // The late work may still settle; its outcome no longer matters.
        work.catch(() => undefined);
        this.logger.warn({ outcome: 'event_publish_timeout', ...context, timeoutMs: this.timeoutMs }, 'Event publication timed out');
      }
    } catch (err) {
      this.logger.warn({ outcome: 'event_publish_failed', ...context, err }, 'Event publication failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
