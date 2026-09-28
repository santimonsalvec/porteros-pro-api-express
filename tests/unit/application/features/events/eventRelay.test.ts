import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { IEventLogger } from '../../../../../src/application/features/events/common/ports.js';
import { EventRelay } from '../../../../../src/application/features/events/common/eventRelay.js';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeEventPublisher } from '../../../../fakes/fakeEventPublisher.js';
import { FakeOutboxStore } from '../../../../fakes/fakeOutboxStore.js';

const NOW = new Date('2026-09-28T18:00:00.000Z');
const event = (id: string): DomainEvent => ({ id, type: 'booking.created', version: 1, occurredAt: NOW, bookingId: `b-${id}`, requestId: 'r-1', payload: {} });

let publisher: FakeEventPublisher;
let outbox: FakeOutboxStore;
let logger: { info: Mock<IEventLogger['info']>; warn: Mock<IEventLogger['warn']> };
let relay: EventRelay;

beforeEach(() => {
  publisher = new FakeEventPublisher();
  outbox = new FakeOutboxStore();
  logger = { info: vi.fn<IEventLogger['info']>(), warn: vi.fn<IEventLogger['warn']>() };
  relay = new EventRelay(publisher, outbox, new FixedClock(NOW), logger, 2000);
  outbox.append([event('e1'), event('e2')], NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EventRelay — publish before responding, never fail the operation', () => {
  it('publishes the events and marks them published', async () => {
    await relay.relay([event('e1'), event('e2')]);

    expect(publisher.published().map((published) => published.id)).toEqual(['e1', 'e2']);
    expect(outbox.all().map((entry) => entry.status)).toEqual(['published', 'published']);
  });

  it('leaves the events pending and resolves when publishing fails', async () => {
    publisher.failNextWith(new Error('pubsub down'));

    await expect(relay.relay([event('e1'), event('e2')])).resolves.toBeUndefined();

    expect(outbox.pending()).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'event_publish_failed', eventIds: ['e1', 'e2'] }), expect.any(String));
  });

  it('gives up after 2 seconds, leaving the events pending', async () => {
    vi.useFakeTimers();
    publisher.delayNextMs(10_000);

    const relaying = relay.relay([event('e1'), event('e2')]);
    await vi.advanceTimersByTimeAsync(2000);
    await relaying;

    expect(outbox.pending()).toHaveLength(2);
    expect(publisher.published()).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'event_publish_timeout' }), expect.any(String));
  });

  it('does nothing for no events', async () => {
    const publish = vi.spyOn(publisher, 'publish');

    await relay.relay([]);

    expect(publish).not.toHaveBeenCalled();
  });
});
