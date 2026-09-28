import { describe, expect, it } from 'vitest';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

describe('CancelBookingsByClientCommand — US1: a booking nobody has taken', () => {
  it('cancels it for free, with the client as author and the reason stored, once', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 3, 2);

    const result = await h.cancel(request.id, bookings[1]!.id, '  Un amigo cubre el arco ');

    expect(result).toMatchObject({ outcome: 'cancelled', request: { requestId: 'r1', status: 'searching' } });
    expect(h.current(bookings[1]!.id)).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'client',
      endReason: 'client_cancelled',
      cancellationNote: 'Un amigo cubre el arco',
    });
    expect(h.current(bookings[0]!.id).status).toBe('pending_assignment');
    expect(h.relayed.map((event) => [event.type, (event.payload as { by: string }).by])).toEqual([['booking.cancelled', 'client']]);
    expect(h.wallet.movements()).toHaveLength(0);

    expect(await h.cancel(request.id, bookings[1]!.id)).toMatchObject({ outcome: 'replayed' });
    expect(h.relayed).toHaveLength(1);
    expect(h.audit.cancellations.map((entry) => entry.outcome)).toEqual(['cancelled', 'replayed']);
  });

  it("answers not found for another client's request or a booking of another request", async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1');
    const other = h.match('r2');

    expect(await h.cancel(request.id, bookings[0]!.id, undefined, 'intruder')).toEqual({ outcome: 'request_not_found' });
    expect(await h.cancel(request.id, other.bookings[0]!.id)).toEqual({ outcome: 'booking_not_found' });
    expect(await h.cancel('nope', null)).toEqual({ outcome: 'request_not_found' });
  });

  it('refuses a booking that already ended, and a reason over 200 characters', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1);
    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());

    expect(await h.cancel(request.id, bookings[0]!.id)).toEqual({ outcome: 'not_cancellable', status: 'expired' });
    expect(await h.cancel(request.id, bookings[0]!.id, 'x'.repeat(201))).toEqual({ outcome: 'invalid_reason' });
  });
});

describe('CancelBookingsByClientCommand — US2: a taken booking', () => {
  it('refunds the goalkeeper once when cancelled in time, and tells them the client cancelled', async () => {
    const h = lifecycleHarness();
    await h.phone('gk-1');
    const { request, bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');

    expect(await h.cancel(request.id, bookings[0]!.id, 'Cambio de planes')).toMatchObject({ outcome: 'cancelled' });
    expect(await h.cancel(request.id, bookings[0]!.id)).toMatchObject({ outcome: 'replayed' });

    expect(await h.balanceOf('gk-1')).toBe(20000);
    const refunds = h.wallet.movements().filter((movement) => movement.type === 'commission_refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: 7000, cancellation: { by: 'client', reason: 'Cambio de planes' } });
    for (const event of h.relayed) await h.goalkeeperNotices.handle(event);
    expect(h.notifications.all()).toMatchObject([{ userId: 'gk-1', type: 'booking.cancelled' }]);
    expect(h.notifications.all()[0]!.body).toMatch(/^El cliente canceló tu partido en Bello · .* Te devolvimos 7\.000 COP\.$/);
    expect(h.current(bookings[0]!.id)).toMatchObject({ status: 'cancelled', goalkeeperId: 'gk-1' });
  });

  it('allows it exactly at the deadline and refuses it a moment later, changing nothing', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.acceptAndPay(bookings[1]!, 'gk-2');

    h.clock.advance(minutes(60)); // exactly start − 60 min: still free
    expect(await h.cancel(request.id, bookings[0]!.id)).toMatchObject({ outcome: 'cancelled' });

    h.clock.advance(1);
    expect(await h.cancel(request.id, bookings[1]!.id)).toEqual({
      outcome: 'window_closed',
      bookingId: bookings[1]!.id,
      freeCancellationUntil: request.freeCancellationUntil().toISOString(),
    });
    expect(h.current(bookings[1]!.id).status).toBe('assigned');
    expect(await h.balanceOf('gk-2')).toBe(13000);
  });

  it("answers temporarily unavailable, changing nothing, when the goalkeeper's wallet can't be resolved", async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 3);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    const profile = (await h.goalkeeperProfileRepository.getByUserId('gk-1'))!;
    await h.goalkeeperProfileRepository.updateAvailability('gk-1', 'city-orphan', profile.zoneIds);

    expect(await h.cancel(request.id, bookings[0]!.id)).toEqual({ outcome: 'temporarily_unavailable' });
    expect(h.current(bookings[0]!.id).status).toBe('assigned');
  });

  it('applies the assigned rules when a goalkeeper took the booking after the client looked', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 3);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    // The handler saw the booking pending, so it resolved no owner; the store then asks for it.
    const findByRequestIds = h.bookingRepository.findByRequestIds.bind(h.bookingRepository);
    let first = true;
    h.bookingRepository.findByRequestIds = async (ids) => {
      const found = await findByRequestIds(ids);
      if (!first) return found;
      first = false;
      return found.map((booking) => h.BookingEntity.rehydrate({ ...booking, status: 'pending_assignment', goalkeeperId: null, assignedAt: null }));
    };

    expect(await h.cancel(request.id, bookings[0]!.id)).toMatchObject({ outcome: 'cancelled' });
    expect(h.wallet.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(1);
  });
});

describe('CancelBookingsByClientCommand — US3: the whole request', () => {
  it('cancels every live booking in time, refunds each goalkeeper once, and ends the request', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');

    const result = await h.cancel(request.id, null);

    expect(result).toMatchObject({ outcome: 'cancelled', request: { status: 'cancelled' } });
    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['cancelled', 'cancelled']);
    expect(h.wallet.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(1);
    expect(h.request(request.id).active).toBe(false);
    expect(await h.cancel(request.id, null)).toMatchObject({ outcome: 'replayed' });
  });

  it('refuses the whole request, changing nothing, when an assigned booking is inside the last hour', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(75));

    expect(await h.cancel(request.id, null)).toMatchObject({ outcome: 'window_closed', bookingId: bookings[0]!.id });
    expect(bookings.map((booking) => h.current(booking.id).status)).toEqual(['assigned', 'pending_assignment']);
    // The searching booking can still be cancelled on its own.
    expect(await h.cancel(request.id, bookings[1]!.id)).toMatchObject({ outcome: 'cancelled' });
  });

  it('answers not cancellable for a request that ended without the client', async () => {
    const h = lifecycleHarness();
    const { request } = h.match('r1', 1);
    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());

    expect(await h.cancel(request.id, null)).toEqual({ outcome: 'not_cancellable', status: 'expired' });
  });
});

describe('016 alignment with client cancellations', () => {
  it("never tells the client about their own cancellation, and judges outcomes without the bookings they cancelled", async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1, 2);
    await h.cancel(request.id, bookings[1]!.id);
    for (const event of h.relayed) await h.clientNotices.handle(event);
    expect(h.notifications.all()).toHaveLength(0);

    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());
    for (const event of h.relayed) await h.clientNotices.handle(event);

    expect(h.notifications.all().map((item) => item.type)).toEqual(['request.expired']);
  });

  it('sends no client notice when the client cancelled everything', async () => {
    const h = lifecycleHarness();
    const { request } = h.match('r1', 3, 2);
    await h.cancel(request.id, null);

    for (const event of h.relayed) await h.clientNotices.handle(event);

    expect(h.notifications.all()).toHaveLength(0);
  });

  it('"cancel all" keeps the booking the client still wants (clarification 3)', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2, 'cancel_all');
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.cancel(request.id, bookings[1]!.id);
    h.clock.advance(minutes(60));

    expect(await h.cancelAllJob.run(h.clock.now())).toMatch(/0 cancelled, 1 kept/);
    expect(h.current(bookings[0]!.id).status).toBe('assigned');
  });
});
