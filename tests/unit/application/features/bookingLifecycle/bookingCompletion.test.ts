import { describe, expect, it } from 'vitest';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

describe('BookingCompletionJob — US1: the match closes on its own (feature 021)', () => {
  it('completes assigned bookings at their end, once, and deactivates the request', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 1);
    await h.acceptAndPay(bookings[0]!, 'g');
    const end = bookings[0]!.endsAt;

    h.clock.set(new Date(end.getTime() - minutes(1)));
    await h.completionJob.run(h.clock.now());
    expect(h.current(bookings[0]!.id).status).toBe('assigned');

    h.clock.set(end);
    expect(await h.completionJob.run(h.clock.now())).toBe('1 bookings completed in 1 requests, 0 failed');
    expect(await h.completionJob.run(h.clock.now())).toBe('0 bookings completed in 0 requests, 0 failed');

    expect(h.current(bookings[0]!.id)).toMatchObject({ status: 'completed', completedAt: end, attendance: null });
    expect(h.relayed.map((event) => event.type)).toEqual(['booking.completed']);
    expect(h.request(request.id).active).toBe(false);
  });

  it('marks checked-in bookings as attended on completion', async () => {
    const h = lifecycleHarness();
    const booking = h.match('r1', 2, 1).bookings[0]!;
    await h.acceptAndPay(booking, 'g');
    h.clock.set(new Date(booking.startsAt.getTime() - minutes(5)));
    await h.checkIn(booking.id, 'g', h.photo('g'));
    h.clock.set(booking.endsAt);

    await h.completionJob.run(h.clock.now());

    expect(h.current(booking.id)).toMatchObject({ status: 'completed', attendance: 'attended' });
  });

  it('never completes cancelled, expired or withdrawn bookings', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'g');
    await h.withdraw(bookings[0]!.id, 'g');
    h.clock.set(new Date(bookings[0]!.endsAt.getTime() + minutes(1)));
    await h.expiryJob.run(h.clock.now());

    await h.completionJob.run(h.clock.now());

    expect(h.bookingRepository.all().map((booking) => booking.status).sort()).toEqual(['expired', 'expired', 'goalkeeper_withdrew']);
  });
});
