import type { IEventRelay } from '../../src/application/features/events/common/ports.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';

/** Records what a handler asked to relay. */
export class FakeEventRelay implements IEventRelay {
  readonly calls: DomainEvent[][] = [];

  async relay(events: readonly DomainEvent[]): Promise<void> {
    this.calls.push([...events]);
  }
}
