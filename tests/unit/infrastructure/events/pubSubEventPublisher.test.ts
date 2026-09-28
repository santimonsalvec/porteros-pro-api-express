import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../../../../src/domain/events/domainEvent.js';

const request = vi.fn();
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() {
    return { request };
  }),
}));

const { PubSubEventPublisher } = await import('../../../../src/infrastructure/events/pubSubEventPublisher.js');

const at = new Date('2026-09-28T18:00:00.000Z');
const event = (n: number): DomainEvent => ({ id: `ev-${n}`, type: 'booking.created', version: 1, occurredAt: at, bookingId: `b-${n}`, requestId: 'r-1', payload: { startsAt: at } });

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ status: 200, data: { messageIds: ['1'] } });
});

describe('PubSubEventPublisher (mocked Google client)', () => {
  it('posts one message per event to the topic, base64 JSON with type/id/version attributes', async () => {
    const signal = new AbortController().signal;

    await new PubSubEventPublisher('porteros-dev', 'booking-events').publish([event(1)], signal);

    const options = request.mock.calls[0]![0];
    expect(options).toMatchObject({ url: 'https://pubsub.googleapis.com/v1/projects/porteros-dev/topics/booking-events:publish', method: 'POST', signal });
    const [message] = options.data.messages;
    expect(message.attributes).toEqual({ type: 'booking.created', eventId: 'ev-1', version: '1' });
    expect(JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'))).toMatchObject({ id: 'ev-1', occurredAt: '2026-09-28T18:00:00.000Z' });
  });

  it('batches at most 100 messages per call', async () => {
    await new PubSubEventPublisher('p', 't').publish(Array.from({ length: 250 }, (_, index) => event(index)));

    expect(request.mock.calls.map((call) => call[0].data.messages.length)).toEqual([100, 100, 50]);
  });

  it('rejects on a non-2xx answer or a client error', async () => {
    request.mockResolvedValueOnce({ status: 503 });
    await expect(new PubSubEventPublisher('p', 't').publish([event(1)])).rejects.toThrow(/503/);

    request.mockRejectedValueOnce(new Error('network down'));
    await expect(new PubSubEventPublisher('p', 't').publish([event(1)])).rejects.toThrow('network down');
  });
});
