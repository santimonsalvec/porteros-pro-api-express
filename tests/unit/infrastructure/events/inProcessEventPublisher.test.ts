import { describe, expect, it } from 'vitest';
import { Mediator } from '../../../../src/application/common/mediator/mediator.js';
import type { DomainEvent } from '../../../../src/domain/events/domainEvent.js';
import { InProcessEventPublisher } from '../../../../src/infrastructure/events/inProcessEventPublisher.js';

const event = (id: string): DomainEvent => ({ id, type: 'booking.created', version: 1, occurredAt: new Date(), bookingId: 'b', requestId: 'r', payload: {} });

describe('InProcessEventPublisher', () => {
  it('delivers every event to the subscribed handlers', async () => {
    const mediator = new Mediator();
    const seen: string[] = [];
    mediator.subscribe('booking.created', { name: 'log', handle: async (n) => void seen.push((n as DomainEvent).id) });

    await new InProcessEventPublisher(mediator).publish([event('e1'), event('e2')]);

    expect(seen).toEqual(['e1', 'e2']);
  });

  it('rejects when a handler fails, so the event stays pending', async () => {
    const mediator = new Mediator();
    mediator.subscribe('booking.created', { name: 'broken', handle: async () => { throw new Error('boom'); } });

    await expect(new InProcessEventPublisher(mediator).publish([event('e1')])).rejects.toThrow(/broken/);
  });
});
