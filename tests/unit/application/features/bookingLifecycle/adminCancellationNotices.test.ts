import { describe, expect, it } from 'vitest';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

describe('notices of an administrator cancellation (admin spec 006, US5, FR-024)', () => {
  it("tells the assigned goalkeeper PorterosPRO cancelled and refunded, and the client once, without the reason", async () => {
    const h = lifecycleHarness();
    await h.phone('gk-1');
    const { request, bookings } = h.match('r1', 2, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.adminCancel(request.id, null, 'La cancha cerró por lluvia');

    for (const event of h.relayed) {
      await h.goalkeeperNotices.handle(event);
      await h.clientNotices.handle(event);
    }
    // A redelivery changes nothing.
    for (const event of h.relayed) await h.clientNotices.handle(event);

    const goalkeeper = h.notifications.all().filter((item) => item.userId === 'gk-1' && item.type === 'booking.cancelled');
    expect(goalkeeper).toHaveLength(1);
    expect(goalkeeper[0]).toMatchObject({ type: 'booking.cancelled', data: { requestId: request.id, bookingId: bookings[0]!.id } });
    expect(goalkeeper[0]!.body).toMatch(/^PorterosPRO canceló tu partido en Bello · .* Te devolvimos 7\.000 COP\.$/);
    const client = h.notifications.all().filter((item) => item.userId === 'client-a');
    expect(client).toHaveLength(1);
    expect(client[0]).toMatchObject({ type: 'booking.cancelled', title: 'Partido cancelado' });
    expect(client[0]!.body).toMatch(/^PorterosPRO canceló tu partido en Bello · /);
    expect(JSON.stringify(h.notifications.all())).not.toContain('lluvia');
  });

  it("tells the client one of their goalkeepers was cancelled when others remain", async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2);
    await h.adminCancel(request.id, bookings[1]!.id);

    for (const event of h.relayed) await h.clientNotices.handle(event);

    const [notice] = h.notifications.all().filter((item) => item.userId === 'client-a');
    expect(notice).toMatchObject({ title: 'Portero cancelado' });
    expect(notice!.body).toMatch(/^PorterosPRO canceló uno de los porteros de tu partido en Bello · /);
  });

  it("leaves the booking it cancelled out of the client's final outcome", async () => {
    const h = lifecycleHarness();
    const { request, bookings } = h.match('r1', 2, 2);
    await h.adminCancel(request.id, bookings[1]!.id);
    const cancelEvents = h.relayed.length;
    h.clock.advance(minutes(91)); // the match is 2 h ahead; its search ends 30 min before it
    await h.expiryJob.run(h.clock.now());

    for (const event of h.relayed.slice(cancelEvents)) await h.clientNotices.handle(event);

    // The other booking expired: "no goalkeeper found", not "cancelled because not all were confirmed".
    const outcome = h.notifications.all().filter((item) => item.userId === 'client-a');
    expect(outcome.map((item) => item.type)).toEqual(['request.expired']);
  });
});
