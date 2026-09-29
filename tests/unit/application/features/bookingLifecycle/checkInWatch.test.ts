import { describe, expect, it, vi } from 'vitest';
import { User } from '../../../../../src/domain/users/user.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

/** `g` holds a Bello match starting in 3 hours (window: start − 30 to start + 15; last call start + 5). */
async function setUp(count: 1 | 2 = 1) {
  const h = lifecycleHarness();
  const user = User.createFromExternalIdentity({ id: 'g', email: 'g@example.com', displayName: null, provider: 'google', subject: 'g' });
  user.completeProfile('Juan', 'Pérez', '+57', '3001234567');
  h.users.seed(user);
  const { bookings } = h.match('r1', 3, count);
  await h.acceptAndPay(bookings[0]!, 'g');
  const start = bookings[0]!.startsAt;
  const at = (minutesFromStart: number) => h.clock.set(new Date(start.getTime() + minutes(minutesFromStart)));
  const run = () => h.checkInWatchJob.run(h.clock.now());
  const of = (userId: string, type: string) => h.notifications.all().filter((item) => item.userId === userId && item.type === type);
  return { ...h, bookings, booking: bookings[0]!, at, run, of };
}

describe('CheckInWatchJob — US3: the client is told when there is no check-in', () => {
  it('tells the client once at the close, with the goalkeeper’s WhatsApp, and marks the booking', async () => {
    const h = await setUp();
    h.at(14);
    await h.run();
    expect(h.of('client-a', 'booking.check_in_missed')).toHaveLength(0);

    h.at(16);
    await h.run();
    await h.run();

    expect(h.of('client-a', 'booking.check_in_missed')).toMatchObject([
      { body: expect.stringContaining('Tu portero Juan Pérez no ha confirmado su llegada'), dedupeKey: `check-in-missed:${h.booking.id}` },
    ]);
    expect(h.of('client-a', 'booking.check_in_missed')[0]!.body).toContain('Escríbele: WhatsApp +57 3001234567.');
    expect(h.current(h.booking.id).checkInMissedAt).toEqual(h.clock.now());
  });

  it('sends nothing for a checked-in booking, or once the match ended', async () => {
    const h = await setUp();
    h.at(-5);
    await h.checkIn(h.booking.id, 'g', h.photo('g'));
    h.at(16);
    await h.run();
    expect(h.of('client-a', 'booking.check_in_missed')).toHaveLength(0);

    const late = await setUp();
    late.at(95); // the 90-minute match already ended
    await late.run();
    expect(late.of('client-a', 'booking.check_in_missed')).toHaveLength(0);
  });

  it('notifies only the goalkeeper who did not check in, in a 2-goalkeeper request', async () => {
    const h = await setUp(2);
    await h.acceptAndPay(h.bookings[1]!, 'g2');
    h.at(-5);
    await h.checkIn(h.booking.id, 'g', h.photo('g'));
    h.at(16);

    await h.run();

    expect(h.of('client-a', 'booking.check_in_missed').map((item) => item.data.bookingId)).toEqual([h.bookings[1]!.id]);
  });

  it('keeps going when one booking fails', async () => {
    const h = await setUp();
    const other = h.match('r2', 3, 1).bookings[0]!;
    await h.acceptAndPay(other, 'g2');
    h.at(16);
    const original = h.bookingRepository.markCheckInNotice.bind(h.bookingRepository);
    vi.spyOn(h.bookingRepository, 'markCheckInNotice').mockImplementation(async (id, field, now) => {
      if (id === h.booking.id) throw new Error('boom');
      return original(id, field, now);
    });

    expect(await h.run()).toBe('0 opened, 0 last calls, 1 missed, 1 failed');
  });
});

describe('CheckInWatchJob — US4: the goalkeeper is reminded', () => {
  it('reminds once when the window opens, and once more 10 minutes before the close without a check-in', async () => {
    const h = await setUp();
    h.at(-31);
    await h.run();
    expect(h.of('g', 'booking.check_in_open')).toHaveLength(0);

    h.at(-30);
    await h.run();
    h.at(-29);
    await h.run();
    expect(h.of('g', 'booking.check_in_open')).toMatchObject([{ dedupeKey: `check-in-open:${h.booking.id}`, data: { bookingId: h.booking.id } }]);

    h.at(5);
    await h.run();
    await h.run();
    expect(h.of('g', 'booking.check_in_last_call')).toHaveLength(1);
    expect(h.current(h.booking.id)).toMatchObject({ checkInOpenNoticeAt: expect.any(Date), checkInLastCallAt: expect.any(Date) });
  });

  it('skips the last call after a check-in', async () => {
    const h = await setUp();
    h.at(-10);
    await h.run();
    await h.checkIn(h.booking.id, 'g', h.photo('g'));
    h.at(6);

    await h.run();

    expect(h.of('g', 'booking.check_in_last_call')).toHaveLength(0);
  });

  it('reminds a goalkeeper assigned inside the window on the next run, and never after the close', async () => {
    const h = lifecycleHarness();
    const booking = h.match('r1', 3, 1).bookings[0]!;
    h.clock.set(new Date(booking.startsAt.getTime() - minutes(10)));
    await h.acceptAndPay(booking, 'g');
    await h.checkInWatchJob.run(h.clock.now());
    expect(h.notifications.all().filter((item) => item.type === 'booking.check_in_open')).toHaveLength(1);

    const closed = lifecycleHarness();
    const other = closed.match('r2', 3, 1).bookings[0]!;
    await closed.acceptAndPay(other, 'g');
    closed.clock.set(new Date(other.startsAt.getTime() + minutes(20)));
    await closed.checkInWatchJob.run(closed.clock.now());
    const types = closed.notifications.all().map((item) => item.type);
    expect(types).not.toContain('booking.check_in_open');
    expect(types).not.toContain('booking.check_in_last_call');
    expect(types).toContain('booking.check_in_missed');
  });

  it('sends nothing for a booking the goalkeeper withdrew from', async () => {
    const h = await setUp();
    h.at(-60);
    await h.withdraw(h.booking.id, 'g');
    h.at(-30);

    await h.run();

    expect(h.of('g', 'booking.check_in_open')).toHaveLength(0);
  });
});
