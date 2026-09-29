import { describe, expect, it } from 'vitest';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import { goalkeeperAssigned } from '../../../../../src/domain/events/bookingEvents.js';
import { User } from '../../../../../src/domain/users/user.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

function harness() {
  const h = lifecycleHarness();
  for (const [id, first, phone] of [['gk-1', 'Juan', '3001112233'], ['gk-2', 'Pedro', '3004445566'], ['gk-3', 'Luis', '3007778899']] as const) {
    const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
    user.completeProfile(first, 'Portero', '+57', phone);
    h.users.seed(user);
  }
  let n = 0;
  /** G takes the booking now, and the consumer processes the "goalkeeper assigned" event. */
  const take = async (booking: Booking, goalkeeperId: string, process = true) => {
    const assigned = h.assign(booking, goalkeeperId);
    const event = goalkeeperAssigned(`ev-${++n}`, assigned ?? booking.assign(goalkeeperId, h.clock.now()), h.clock.now());
    if (process) await h.assignmentNotices.handle(event);
    return event;
  };
  const clientNotices = () => h.notifications.all().filter((item) => item.userId === 'client-a');
  return { ...h, take, clientNotices };
}

describe('client assignment notices — US1: a goalkeeper took one booking', () => {
  it('tells the client once, without naming the goalkeeper, while the other booking searches', async () => {
    const h = harness();
    await h.phone('client-a');
    const { bookings } = h.match('r1', 5, 2);

    const event = await h.take(bookings[0]!, 'gk-1');
    await h.assignmentNotices.handle(event);

    expect(h.clientNotices()).toMatchObject([
      {
        type: 'booking.goalkeeper_assigned',
        body: expect.stringMatching(/^Un portero tomó tu partido en Bello · .* Seguimos buscando el otro\.$/),
        data: { type: 'booking.goalkeeper_assigned', requestId: 'r1', bookingId: bookings[0]!.id },
        dedupeKey: `goalkeeper-assigned:${bookings[0]!.id}`,
      },
    ]);
    expect(h.clientNotices()[0]!.body).not.toMatch(/Juan|300/);
    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('sends nothing when the booking is no longer theirs, or the match is over', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 5, 2);
    const event = await h.take(bookings[0]!, 'gk-1', false);
    h.bookingRepository.seed(h.BookingEntity.rehydrate({ ...h.current(bookings[0]!.id), status: 'cancelled', cancelledBy: 'client' }));
    await h.assignmentNotices.handle(event);

    const other = h.match('r2', 1, 2).bookings[0]!;
    const late = await h.take(other, 'gk-2', false);
    h.clock.advance(minutes(200));
    await h.assignmentNotices.handle(late);

    expect(h.clientNotices()).toHaveLength(0);
  });

  it('says another goalkeeper was found for a replacement', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 5, 2);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.withdraw(bookings[0]!.id, 'gk-1');
    const replacement = h.bookingRepository.all().find((booking) => booking.replacesBookingId === bookings[0]!.id)!;

    await h.take(replacement, 'gk-3');

    expect(h.clientNotices().filter((item) => item.type === 'booking.goalkeeper_assigned')[0]!.body).toMatch(/^Encontramos otro portero para tu partido/);
  });

  it('names the goalkeeper when the booking is taken in the last hour', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 0.75, 2); // starts in 45 min: contacts already visible

    await h.take(bookings[0]!, 'gk-1');

    expect(h.clientNotices()[0]!.body).toContain('Es Juan Portero · WhatsApp +57 3001112233.');
  });
});

describe('client assignment notices — US2: the request is complete', () => {
  it('sends only "complete" for a 1-goalkeeper request', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 5, 1);

    await h.take(bookings[0]!, 'gk-1');

    expect(h.clientNotices()).toMatchObject([
      { type: 'request.complete', body: expect.stringMatching(/^¡Listo! Tu portero está confirmado .* Verás sus datos 1 hora antes\.$/), dedupeKey: 'request-complete:r1' },
    ]);
  });

  it('sends "assigned" then "complete" for two acceptances in turn, and never two "complete"', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 5, 2);

    await h.take(bookings[0]!, 'gk-1');
    await h.take(bookings[1]!, 'gk-2');
    expect(h.clientNotices().map((item) => item.type).sort()).toEqual(['booking.goalkeeper_assigned', 'request.complete']);

    const other = harness();
    const pair = other.match('r2', 5, 2).bookings;
    const first = await other.take(pair[0]!, 'gk-1', false);
    const second = await other.take(pair[1]!, 'gk-2', false);
    await other.assignmentNotices.handle(first);
    await other.assignmentNotices.handle(second);
    expect(other.clientNotices().map((item) => item.type)).toEqual(['request.complete']);
  });

  it('counts a request complete when the client cancelled the other booking', async () => {
    const h = harness();
    const { request, bookings } = h.match('r1', 5, 2);
    await h.cancel(request.id, bookings[1]!.id);

    await h.take(bookings[0]!, 'gk-1');

    expect(h.clientNotices()).toMatchObject([{ type: 'request.complete', body: expect.stringMatching(/^¡Listo! Tu portero está confirmado/) }]);
  });

  it('tells the client again when a replacement completes the request after a withdrawal', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 5, 1);
    await h.acceptAndPay(bookings[0]!, 'gk-1');
    await h.assignmentNotices.handle(goalkeeperAssigned('ev-first', h.current(bookings[0]!.id), h.clock.now()));
    await h.withdraw(bookings[0]!.id, 'gk-1');
    const replacement = h.bookingRepository.all().find((booking) => booking.replacesBookingId === bookings[0]!.id)!;

    await h.take(replacement, 'gk-2');

    expect(h.clientNotices().filter((item) => item.type === 'request.complete').map((item) => item.dedupeKey)).toEqual([
      'request-complete:r1',
      `request-complete:r1:${replacement.id}`,
    ]);
  });

  it('lists the goalkeepers taken in the last hour', async () => {
    const h = harness();
    const { bookings } = h.match('r1', 0.75, 2);

    await h.take(bookings[0]!, 'gk-1');
    await h.take(bookings[1]!, 'gk-2');

    const complete = h.clientNotices().find((item) => item.type === 'request.complete')!;
    expect(complete.body).toContain('Son Juan Portero · WhatsApp +57 3001112233 y Pedro Portero · WhatsApp +57 3004445566.');
  });
});
