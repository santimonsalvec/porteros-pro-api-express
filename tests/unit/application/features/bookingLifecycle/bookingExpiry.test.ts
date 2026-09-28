import { describe, expect, it } from 'vitest';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

describe('BookingExpiryJob', () => {
  it('expires the pending bookings whose search ended, once, and records one event each', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1, 2); // starts in 1 h, search ends in 30 min
    h.clock.advance(minutes(31));

    await h.expiryJob.run(h.clock.now());
    await h.expiryJob.run(h.clock.now());

    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['expired', 'expired']);
    expect(h.current(bookings[0]!.id)).toMatchObject({ endReason: 'search_ended', endedAt: h.clock.now() });
    expect(h.relayed.map((event) => event.type)).toEqual(['booking.expired', 'booking.expired']);
    expect(h.request(request.id).active).toBe(false);
  });

  it('leaves bookings still searching and assigned ones alone, and keeps a partly assigned request active', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1, 2);
    const later = h.match('r2', 5);
    h.assign(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(31));

    await h.expiryJob.run(h.clock.now());

    expect(h.current(bookings[0]!.id).status).toBe('assigned');
    expect(h.current(bookings[1]!.id).status).toBe('expired');
    expect(h.current(later.bookings[0]!.id).status).toBe('pending_assignment');
    expect(h.request(request.id).active).toBe(true);
  });

  it('expires each booking once when two runs overlap', async () => {
    const h = lifecycleHarness();
    h.match('r1', 1, 2);
    h.clock.advance(minutes(31));

    await Promise.all([h.expiryJob.run(h.clock.now()), h.expiryJob.run(h.clock.now())]);

    expect(h.relayed).toHaveLength(2);
  });

  it('keeps going when one request fails', async () => {
    const h = lifecycleHarness();
    h.match('r-bad', 1);
    const good = h.match('r-good', 1);
    const expire = h.store.expire.bind(h.store);
    h.store.expire = async (requestId, now, build) => {
      if (requestId === 'r-bad') throw new Error('boom');
      return expire(requestId, now, build);
    };
    h.clock.advance(minutes(31));

    expect(await h.expiryJob.run(h.clock.now())).toBe('1 bookings expired in 1 requests, 1 failed');
    expect(h.current(good.bookings[0]!.id).status).toBe('expired');
  });
});

describe('ClientOutcomeNoticeHandler', () => {
  it('tells the client once that no goalkeeper was found, even with two events', async () => {
    const h = lifecycleHarness();
    await h.phone('client-a');
    h.match('r1', 1, 2);
    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());

    for (const event of h.relayed) await h.clientNotices.handle(event);
    for (const event of h.relayed) await h.clientNotices.handle(event);

    expect(h.notifications.all()).toMatchObject([{ userId: 'client-a', type: 'request.expired', dedupeKey: 'request-outcome:r1' }]);
    expect(h.pushSender.calls).toHaveLength(1);
    expect(h.pushSender.calls[0]!.message.body).toMatch(/^No logramos hallar un portero para tu partido en Bello · /);
  });

  it('says how many goalkeepers were found when only some were', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 1, 2);
    h.assign(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());

    await h.clientNotices.handle(h.relayed[0]!);

    expect(h.notifications.all()[0]).toMatchObject({ type: 'request.partially_expired' });
    expect(h.notifications.all()[0]!.body).toMatch(/^Conseguimos 1 de 2 porteros/);
  });

  it('waits while a booking of the request is still searching', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 1, 2);
    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());
    h.bookingRepository.seed(h.BookingEntity.rehydrate({ ...h.current(bookings[1]!.id), status: 'pending_assignment' }));

    await h.clientNotices.handle(h.relayed[0]!);

    expect(h.notifications.all()).toHaveLength(0);
  });
});
