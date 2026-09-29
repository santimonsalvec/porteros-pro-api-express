import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_TOKEN } from '../testAppFactory.js';
import type { TestApp } from '../walletTestHelpers.js';

const eventJson = (id = 'ev-1') => ({
  id,
  type: 'booking.created',
  version: 1,
  occurredAt: '2026-09-28T18:00:00.000Z',
  bookingId: 'b-1',
  requestId: 'r-1',
  payload: { clientId: 'c-1', zoneId: 'z-1', startsAt: '2026-09-29T20:00:00.000Z', commission: 7000, currency: 'COP', goalkeeperCount: 1 },
});

/** The body Pub/Sub pushes. */
const push = (json: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(json)).toString('base64'), attributes: { type: 'booking.created' }, messageId: 'm-1' },
  subscription: 'projects/p/subscriptions/booking-events-api',
});

const deliver = (context: TestApp, body: unknown, query = '') =>
  request(context.app).post(`/internal/events${query}`).set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`).send(body as object);

describe('POST /internal/events — US3: each event takes effect exactly once per consumer', () => {
  it('204 and one delivery-log entry for a delivery', async () => {
    const context = await buildTestApp();

    const response = await deliver(context, push(eventJson()));

    expect(response.status).toBe(204);
    expect(context.eventDeliveryLog.all().map((event) => event.id)).toEqual(['ev-1']);
  });

  it('the same event delivered 5 times, or 20 at once, is logged once and always acknowledged', async () => {
    const context = await buildTestApp();

    const sequential: number[] = [];
    for (let delivery = 0; delivery < 5; delivery++) sequential.push((await deliver(context, push(eventJson()))).status);
    const concurrent = await Promise.all(Array.from({ length: 20 }, () => deliver(context, push(eventJson()))));

    expect(sequential).toEqual([204, 204, 204, 204, 204]);
    expect(concurrent.every((response) => response.status === 204)).toBe(true);
    expect(context.eventDeliveryLog.all()).toHaveLength(1);
  });

  it.each([
    ['a body that is not a push envelope', { hello: 'world' }],
    ['an unknown event type', push({ ...eventJson(), type: 'booking.exploded' })],
    ['data that is not JSON', { message: { data: Buffer.from('not json').toString('base64') } }],
  ])('acknowledges %s without effect, so it is never retried', async (_label, body) => {
    const context = await buildTestApp();

    const response = await deliver(context, body);

    expect(response.status).toBe(204);
    expect(context.eventDeliveryLog.all()).toHaveLength(0);
  });

  it('500 when a consumer fails, so Pub/Sub retries; consumers that succeeded skip the retry', async () => {
    const context = await buildTestApp();
    let failures = 1;
    context.mediator.subscribe('booking.created', {
      name: 'flaky',
      handle: async () => {
        if (failures-- > 0) throw new Error('downstream unavailable');
      },
    });

    const first = await deliver(context, push(eventJson()));
    const retry = await deliver(context, push(eventJson()));

    expect(first.status).toBe(500);
    expect(first.body.error).toBe('event_handlers_failed');
    expect(retry.status).toBe(204);
    expect(context.eventDeliveryLog.all()).toHaveLength(1);
  });

  it('?consumer= runs only that consumer', async () => {
    const context = await buildTestApp();
    const seen: string[] = [];
    context.mediator.subscribe('booking.created', { name: 'other', handle: async () => void seen.push('other') });

    await deliver(context, push(eventJson()), '?consumer=other');

    expect(seen).toEqual(['other']);
    expect(context.eventDeliveryLog.all()).toHaveLength(0);
  });
});

describe('POST /internal/sweep — US4: the every-minute sweep', () => {
  it('200 with the report, publishing pending events', async () => {
    const context = await buildTestApp();
    context.outboxStore.append(
      [{ id: 'ev-9', type: 'booking.created', version: 1, occurredAt: context.clock.now(), bookingId: 'b-9', requestId: 'r-9', payload: {} }],
      context.clock.now(),
    );
    context.clock.advance(31_000);

    const response = await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      published: 1,
      stillPending: 0,
      oldestPendingSeconds: null,
      // Features 015, 016 and 019 register their jobs on the sweep.
      jobs: [
        { name: 'cancel-all', outcome: 'succeeded', detail: '0 cancelled, 0 kept, 0 refunds, 0 skipped, 0 failed' },
        { name: 'booking-expiry', outcome: 'succeeded', detail: '0 bookings expired in 0 requests, 0 failed' },
        { name: 'booking-completion', outcome: 'succeeded', detail: '0 bookings completed in 0 requests, 0 failed' },
        { name: 'no-show-watch', outcome: 'succeeded', detail: '0 no-shows, 0 attended, 0 failed' },
        { name: 'offer-reminders', outcome: 'succeeded', detail: '0 open bookings' },
        { name: 'contacts-reveal', outcome: 'succeeded', detail: '0 revealed, 0 without goalkeepers, 0 notices, 0 failed' },
        { name: 'check-in-watch', outcome: 'succeeded', detail: '0 opened, 0 last calls, 0 missed, 0 failed' },
        { name: 'top-up-reconcile', outcome: 'succeeded', detail: '0 checked, 0 applied, 0 expired, 0 failed' },
      ],
    });
    expect(context.eventPublisher.published().map((event) => event.id)).toEqual(['ev-9']);
  });
});
