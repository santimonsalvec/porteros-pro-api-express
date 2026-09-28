import type { IEventDeliveryLog } from '../../src/application/features/events/common/ports.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';

export class FakeEventDeliveryLog implements IEventDeliveryLog {
  readonly entries = new Map<string, { event: DomainEvent; receivedAt: Date }>();

  async record(event: DomainEvent, at: Date): Promise<'recorded' | 'duplicate'> {
    if (this.entries.has(event.id)) return 'duplicate';
    this.entries.set(event.id, { event, receivedAt: at });
    return 'recorded';
  }

  all(): DomainEvent[] {
    return [...this.entries.values()].map((entry) => entry.event);
  }
}
