import { describe, expect, it } from 'vitest';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

describe('CancelBookingsByAdminCommand (admin spec 006, US5)', () => {
  it('cancels the whole request past its free-cancellation period, refunds the goalkeeper once, and names the member', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    h.clock.advance(minutes(61)); // past start − 60 min: the client could no longer cancel

    const result = await h.adminCancel(request.id, null, '  La cancha cerró por lluvia ');

    expect(result).toEqual({ outcome: 'cancelled', cancelled: [bookings[0]!.id, bookings[1]!.id], refunds: 1 });
    for (const booking of bookings) {
      expect(h.current(booking.id)).toMatchObject({
        status: 'cancelled',
        endReason: 'admin_cancelled',
        cancelledBy: 'admin',
        cancellationNote: 'La cancha cerró por lluvia',
        cancelledByStaffId: 'staff-user-1',
      });
    }
    expect(await h.balanceOf('gk-1')).toBe(20000);
    const refunds = h.operatingBalance.movements().filter((movement) => movement.type === 'commission_refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: 7000, cancellation: { by: 'admin', reason: 'admin_cancelled' }, actor: { kind: 'admin', userId: 'staff-user-1' } });
    expect(h.relayed.map((event) => [event.type, (event.payload as { by: string; reason: string }).by])).toEqual([
      ['booking.cancelled', 'admin'],
      ['booking.cancelled', 'admin'],
    ]);
    expect(h.store.incidents()).toEqual([]);
    expect(h.request(request.id).active).toBe(false);
  });

  it('replays the same cancellation without a second refund nor event', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 1);
    await h.acceptAndPay(bookings[0]!, 'gk-1');

    expect(await h.adminCancel(request.id, bookings[0]!.id)).toMatchObject({ outcome: 'cancelled', refunds: 1 });
    expect(await h.adminCancel(request.id, bookings[0]!.id)).toEqual({ outcome: 'replayed' });
    expect(h.operatingBalance.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(1);
    expect(h.relayed).toHaveLength(1);
  });

  it('refuses a reason too short or too long, an unknown request or booking, and a booking that already ended', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1);

    expect(await h.adminCancel(request.id, null, 'ab')).toEqual({ outcome: 'invalid_reason' });
    expect(await h.adminCancel(request.id, null, 'x'.repeat(301))).toEqual({ outcome: 'invalid_reason' });
    expect(await h.adminCancel('nope', null)).toEqual({ outcome: 'request_not_found' });
    expect(await h.adminCancel(request.id, 'nope')).toEqual({ outcome: 'booking_not_found' });
    h.clock.advance(minutes(31));
    await h.expiryJob.run(h.clock.now());
    expect(await h.adminCancel(request.id, bookings[0]!.id)).toEqual({ outcome: 'not_cancellable', status: 'expired' });
  });

  it("answers temporarily unavailable, changing nothing, when the goalkeeper's operatingBalance can't be resolved", async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1);
    h.assign(bookings[0]!, 'gk-without-profile');

    expect(await h.adminCancel(request.id, null)).toEqual({ outcome: 'temporarily_unavailable' });
    expect(h.current(bookings[0]!.id).status).toBe('assigned');
  });

  it('logs each attempt with its outcome and ids, never the reason', async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 1);

    await h.adminCancel(request.id, bookings[0]!.id, 'La cancha cerró por lluvia');
    await h.adminCancel(request.id, null, 'no');

    expect(h.audit.adminCancellations).toEqual([
      { outcome: 'cancelled', staffUserId: 'staff-user-1', requestId: request.id, bookingId: bookings[0]!.id },
      { outcome: 'invalid_reason', staffUserId: 'staff-user-1', requestId: request.id },
    ]);
    expect(JSON.stringify(h.audit.adminCancellations)).not.toContain('lluvia');
  });
});
