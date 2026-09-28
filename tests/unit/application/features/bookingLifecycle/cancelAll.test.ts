import { describe, expect, it } from 'vitest';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

describe('CancelAllJob', () => {
  it('cancels an incomplete "cancel all" request at start − 60 min and refunds the goalkeeper once', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2, 'cancel_all'); // starts in 2 h: evaluated in 1 h
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    expect(await h.balanceOf('gk-1')).toBe(13000);

    h.clock.advance(minutes(59));
    await h.cancelAllJob.run(h.clock.now());
    expect(h.current(bookings[0]!.id).status).toBe('assigned'); // not yet due

    h.clock.advance(minutes(1));
    await h.cancelAllJob.run(h.clock.now());
    await h.cancelAllJob.run(h.clock.now());

    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['cancelled', 'cancelled']);
    expect(h.current(bookings[0]!.id)).toMatchObject({ endReason: 'cancel_all', cancelledBy: 'system', goalkeeperId: 'gk-1' });
    expect(await h.balanceOf('gk-1')).toBe(20000);
    const refunds = h.wallet.movements().filter((movement) => movement.type === 'commission_refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: 7000, causeKey: `commission_refund:${bookings[0]!.id}`, cancellation: { by: 'system', reason: 'cancel_all' } });
    expect(h.relayed.map((event) => [event.type, (event.payload as { refundedAmount: number | null }).refundedAmount])).toEqual([
      ['booking.cancelled', 7000],
      ['booking.cancelled', null],
    ]);
    expect(h.request(request.id)).toMatchObject({ active: false, cancelAllEvaluatedAt: h.clock.now() });
  });

  it('cancels the whole request when nobody took the replacement of a withdrawal by start − 60 (feature 018)', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 3, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.acceptAndPay(bookings[1]!, 'gk-2');
    await h.withdraw(bookings[1]!.id, 'gk-2');
    h.clock.advance(minutes(120));

    await h.cancelAllJob.run(h.clock.now());

    const replacement = h.bookingRepository.all().find((booking) => booking.replacesBookingId === bookings[1]!.id)!;
    expect(h.current(bookings[0]!.id)).toMatchObject({ status: 'cancelled', endReason: 'cancel_all' });
    expect(h.current(replacement.id).status).toBe('cancelled');
    expect(h.current(bookings[1]!.id).status).toBe('goalkeeper_withdrew');
    expect(await h.balanceOf('gk-1')).toBe(20000);
    expect(await h.balanceOf('gk-2')).toBe(13000);
    expect(h.request(request.id).active).toBe(false);
  });

  it('keeps the request when the replacement was taken in time (feature 018)', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 3, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.acceptAndPay(bookings[1]!, 'gk-2');
    await h.withdraw(bookings[1]!.id, 'gk-2');
    const replacement = h.bookingRepository.all().find((booking) => booking.replacesBookingId === bookings[1]!.id)!;
    await h.acceptAndPay(replacement, 'gk-3');
    h.clock.advance(minutes(120));

    await h.cancelAllJob.run(h.clock.now());

    expect(h.current(bookings[0]!.id).status).toBe('assigned');
    expect(h.current(replacement.id).status).toBe('assigned');
  });

  it('keeps a complete request firm and never evaluates it again', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.acceptAndPay(bookings[1]!, 'gk-2');
    h.clock.advance(minutes(60));

    expect(await h.cancelAllJob.run(h.clock.now())).toMatch(/0 cancelled, 1 kept/);
    expect(await h.cancelAllJob.run(h.clock.now())).toMatch(/0 cancelled, 0 kept/);
    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['assigned', 'assigned']);
    expect(h.request(request.id).cancelAllEvaluatedAt).toEqual(h.clock.now());
  });

  it('never touches "keep the confirmed goalkeepers" requests', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 2, 2, 'keep_confirmed');
    h.clock.advance(minutes(61));

    await h.cancelAllJob.run(h.clock.now());

    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['pending_assignment', 'pending_assignment']);
  });

  it('refunds each goalkeeper once when two runs overlap', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 2, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(60));

    await Promise.all([h.cancelAllJob.run(h.clock.now()), h.cancelAllJob.run(h.clock.now())]);

    expect(h.wallet.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(1);
    expect(h.relayed).toHaveLength(2);
  });

  it('skips a request whose goalkeeper wallet cannot be resolved, and retries it later', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 2, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    const profile = (await h.goalkeeperProfileRepository.getByUserId('gk-1'))!;
    await h.goalkeeperProfileRepository.updateAvailability('gk-1', 'city-orphan', profile.zoneIds);
    h.clock.advance(minutes(60));

    expect(await h.cancelAllJob.run(h.clock.now())).toMatch(/1 skipped/);
    expect(h.current(bookings[1]!.id).status).toBe('pending_assignment');

    await h.goalkeeperProfileRepository.updateAvailability('gk-1', 'city-cali', profile.zoneIds);
    expect(await h.cancelAllJob.run(h.clock.now())).toMatch(/1 cancelled/);
  });

  it('cancels a request whose other booking had already expired, leaving it expired', async () => {
    const h = lifecycleHarness();
    const { bookings } = h.match('r1', 2, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    h.bookingRepository.seed(h.BookingEntity.rehydrate({ ...h.current(bookings[1]!.id), status: 'expired' }));
    h.clock.advance(minutes(60));

    await h.cancelAllJob.run(h.clock.now());

    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['cancelled', 'expired']);
  });
});

describe('outcome notices after "cancel all"', () => {
  it('tells the goalkeeper (with the refund) and the client, once each', async () => {
    const h = lifecycleHarness();
    await h.phone('gk-1');
    await h.phone('client-a');
    const { bookings } = h.match('r1', 2, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(60));
    await h.cancelAllJob.run(h.clock.now());

    for (let delivery = 0; delivery < 2; delivery += 1) {
      for (const event of h.relayed) {
        await h.goalkeeperNotices.handle(event);
        await h.clientNotices.handle(event);
      }
    }

    const notices = h.notifications.all().map((item) => [item.userId, item.type]);
    expect(notices).toEqual([
      ['gk-1', 'booking.cancelled'],
      ['client-a', 'request.cancelled'],
    ]);
    expect(h.notifications.all()[0]!.body).toMatch(/Te devolvimos 7\.000 COP\.$/);
    expect(h.pushSender.calls.map((call) => call.userId).sort()).toEqual(['client-a', 'gk-1']);
  });
});
