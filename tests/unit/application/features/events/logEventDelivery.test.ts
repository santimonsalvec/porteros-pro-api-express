import { describe, expect, it, vi } from 'vitest';
import { LogEventDeliveryHandler } from '../../../../../src/application/features/events/handlers/logEventDelivery.js';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeEventDeliveryLog } from '../../../../fakes/fakeEventDeliveryLog.js';
import { FakeProcessedEventStore } from '../../../../fakes/fakeProcessedEventStore.js';

const event: DomainEvent = { id: 'ev-1', type: 'booking.created', version: 1, occurredAt: new Date(), bookingId: 'b-1', requestId: 'r-1', payload: {} };

describe('LogEventDeliveryHandler — US3: the example consumer', () => {
  it('records an event once however many times it is delivered', async () => {
    const log = new FakeEventDeliveryLog();
    const handler = new LogEventDeliveryHandler(log, new FakeProcessedEventStore(), new FixedClock(), { info: vi.fn(), warn: vi.fn() });

    for (let delivery = 0; delivery < 5; delivery++) await handler.handle(event);

    expect(log.all()).toEqual([event]);
  });

  it('records once even when two deliveries pass the marker check together', async () => {
    const log = new FakeEventDeliveryLog();
    const handler = new LogEventDeliveryHandler(log, new FakeProcessedEventStore(), new FixedClock(), { info: vi.fn(), warn: vi.fn() });

    await Promise.all(Array.from({ length: 20 }, () => handler.handle(event)));

    expect(log.all()).toHaveLength(1);
  });
});
