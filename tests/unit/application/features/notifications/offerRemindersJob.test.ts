import { describe, expect, it } from 'vitest';
import { OfferRemindersJob } from '../../../../../src/application/features/notifications/jobs/offerRemindersJob.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { offerHarness } from './offerHarness.js';

const minutes = (n: number) => n * 60_000;

function harness() {
  const h = offerHarness();
  const job = new OfferRemindersJob({ bookingRepository: h.bookingRepository, eligibility: h.eligibility, sender: h.sender, logger: h.silent, roundCap: 2000 });
  const round = () => job.run(h.clock.now());
  /** The first notification of these bookings, as the event consumer sends it. */
  const firstNotification = async (goalkeeperId: string, bookings: Booking[]) =>
    h.sender.send(new Map([[goalkeeperId, bookings]]), h.clock.now(), 'first');
  return { ...h, job, round, firstNotification };
}

describe('OfferRemindersJob', () => {
  it('reminds a goalkeeper of two unopened offers with one grouped push', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const a = h.match('r1', 3);
    const b = h.match('r2', 6);
    await h.firstNotification('g1', [...a.bookings, ...b.bookings]);
    h.clock.advance(minutes(5));

    await h.round();

    expect(h.pushSender.calls).toHaveLength(2);
    expect(h.pushSender.calls[1]!.message.body).toBe('Hay 2 partidos disponibles en tus zonas');
    expect(h.notifications.all().map((offer) => offer.reminderCount)).toEqual([1, 1]);
  });

  it('describes the remaining match once the other was opened', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const a = h.match('r1', 3);
    const b = h.match('r2', 6);
    await h.firstNotification('g1', [...a.bookings, ...b.bookings]);
    await h.notifications.markRead(h.notifications.all()[0]!.id, 'g1', h.clock.now());
    h.clock.advance(minutes(5));

    await h.round();

    expect(h.pushSender.calls.at(-1)!.message).toMatchObject({ title: 'Partido disponible', data: { requestId: 'r2' } });
  });

  it('sends nothing within 5 minutes of the last push, then exactly 3 reminders', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const { bookings } = h.match('r1', 30);
    await h.firstNotification('g1', bookings);

    h.clock.advance(minutes(2));
    await h.round();
    expect(h.pushSender.calls).toHaveLength(1);

    for (let round = 0; round < 5; round += 1) {
      h.clock.advance(minutes(5));
      await h.round();
    }
    expect(h.pushSender.calls).toHaveLength(4);
    expect(h.notifications.all()[0]!.reminderCount).toBe(3);
  });

  it('never reminds a dismissed offer', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const { bookings } = h.match('r1');
    await h.firstNotification('g1', bookings);
    await h.notifications.dismissOffer(h.notifications.all()[0]!.id, 'g1', h.clock.now());
    h.clock.advance(minutes(5));

    await h.round();

    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('offers the match to a goalkeeper who became eligible, as a first notification', async () => {
    const h = harness();
    h.match('r1');
    h.goalkeeper('late');
    await h.phone('late');

    await h.round();

    expect(h.notifications.all()).toMatchObject([{ userId: 'late', reminderCount: 0, notifiedAt: h.clock.now() }]);
    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('drops a match someone else took, and a goalkeeper who switched offers off', async () => {
    const h = harness();
    h.goalkeeper('g1');
    h.goalkeeper('g2');
    await h.phone('g1');
    await h.phone('g2');
    const taken = h.match('r-taken');
    const open = h.match('r-open', 6);
    await h.firstNotification('g1', [...taken.bookings, ...open.bookings]);
    await h.firstNotification('g2', open.bookings);
    h.bookingRepository.seed(Booking.rehydrate({ ...taken.bookings[0]!, status: 'assigned', goalkeeperId: 'x', assignedAt: h.clock.now() }));
    await h.goalkeeperProfileRepository.setAvailableForOffers('g2', false);
    h.clock.advance(minutes(5));

    await h.round();

    // One first push each (g1's groups its two offers), then the round.
    const reminders = h.pushSender.calls.slice(2);
    expect(reminders.map((call) => call.userId)).toEqual(['g1']);
    expect(reminders[0]!.message.data).toMatchObject({ requestId: 'r-open' });
  });

  it('pushes each goalkeeper at most once when two rounds run at the same time', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const { bookings } = h.match('r1');
    await h.firstNotification('g1', bookings);
    h.clock.advance(minutes(5));

    await Promise.all([h.round(), h.round()]);

    expect(h.pushSender.calls).toHaveLength(2);
  });

  it('runs the same at 1 a.m. local time: no quiet hours', async () => {
    const h = harness();
    h.clock.set('2026-10-05T06:00:00.000Z'); // 01:00 in Bogotá
    h.goalkeeper('g1');
    await h.phone('g1');
    h.match('r-night', 14); // starts 03:00 local, 14 h after OFFERS_NOW

    expect(await h.round()).toMatch(/1 goalkeepers pushed/);
  });

  it('does nothing without open bookings', async () => {
    const h = harness();

    expect(await h.round()).toBe('0 open bookings');
  });
});
