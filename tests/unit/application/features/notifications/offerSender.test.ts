import { describe, expect, it } from 'vitest';
import { offerHarness } from './offerHarness.js';

const minutes = (n: number) => n * 60_000;

describe('OfferSender', () => {
  it('first: creates one offer per goalkeeper and request, and pushes only what it created', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const { bookings } = h.match('r1', 3, 2);

    const first = await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
    const again = await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');

    expect(first).toMatchObject({ entriesCreated: 1, pushed: 1, reached: 1 });
    expect(again).toMatchObject({ entriesCreated: 0, pushed: 0 });
    expect(h.notifications.all()).toHaveLength(1);
    expect(h.pushSender.calls).toHaveLength(1);
    expect(h.pushSender.calls[0]!.message).toMatchObject({
      title: 'Partido disponible',
      body: 'Bello · dom 4 oct, 4:00 p. m. · 90 min',
      data: { type: 'booking.available', requestId: 'r1', bookingId: 'r1-b1' },
    });
    expect(h.notifications.all()[0]).toMatchObject({ notifiedAt: h.clock.now(), reminderCount: 0 });
  });

  it('first: still records the offer for a goalkeeper without a phone', async () => {
    const h = offerHarness();
    const { bookings } = h.match('r1');

    const report = await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');

    expect(report).toMatchObject({ entriesCreated: 1, pushed: 1, reached: 0 });
    expect(h.notifications.all()).toHaveLength(1);
  });

  it('round: groups every open offer into ONE push and counts a reminder on each', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const a = h.match('r1', 3);
    const b = h.match('r2', 5);
    const c = h.match('r3', 7);
    await h.sender.send(new Map([['g1', [...a.bookings, ...b.bookings, ...c.bookings]]]), h.clock.now(), 'first');
    h.clock.advance(minutes(5));

    const report = await h.sender.send(new Map([['g1', [...a.bookings, ...b.bookings, ...c.bookings]]]), h.clock.now(), 'round');

    expect(report).toMatchObject({ pushed: 1, reached: 1 });
    expect(h.pushSender.calls.at(-1)!.message).toMatchObject({
      body: 'Hay 3 partidos disponibles en tus zonas',
      data: { type: 'bookings.available' },
    });
    expect(h.notifications.all().map((offer) => offer.reminderCount)).toEqual([1, 1, 1]);
  });

  it('round: a single open offer is described, not counted', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const { bookings } = h.match('r1');
    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
    h.clock.advance(minutes(5));

    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'round');

    expect(h.pushSender.calls.at(-1)!.message.data).toEqual({ type: 'booking.available', requestId: 'r1', bookingId: 'r1-b1' });
  });

  it('round: never pushes a goalkeeper again within the interval', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const { bookings } = h.match('r1');
    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
    h.clock.advance(minutes(4));

    expect(await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'round')).toMatchObject({ pushed: 0 });
    expect(h.notifications.all()[0]!.reminderCount).toBe(0);
  });

  it('round: skips read, dismissed and capped offers', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const read = h.match('r-read');
    const dismissed = h.match('r-dismissed', 5);
    const capped = h.match('r-capped', 7);
    const all = [...read.bookings, ...dismissed.bookings, ...capped.bookings];
    await h.sender.send(new Map([['g1', all]]), h.clock.now(), 'first');
    const [readOffer, dismissedOffer, cappedOffer] = h.notifications.all();
    await h.notifications.markRead(readOffer!.id, 'g1', h.clock.now());
    await h.notifications.dismissOffer(dismissedOffer!.id, 'g1', h.clock.now());
    await h.notifications.markReminded([cappedOffer!.id, cappedOffer!.id, cappedOffer!.id], h.clock.now());
    h.clock.advance(minutes(5));

    expect(await h.sender.send(new Map([['g1', all]]), h.clock.now(), 'round')).toMatchObject({ pushed: 0 });
  });

  it('round: skips a deleted offer, even one never marked read (feature 025)', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const { bookings } = h.match('r-deleted');
    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
    const [offer] = h.notifications.all();
    h.notifications.seed({ ...offer!, readAt: null, deletedAt: h.clock.now() });
    h.clock.advance(minutes(5));

    expect(await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'round')).toMatchObject({ pushed: 0 });
  });

  it('round: deleting an offer from the inbox stops its reminders (feature 025)', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const { bookings } = h.match('r1');
    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
    const [offer] = h.notifications.all();
    await h.notifications.deleteForUser(offer!.id, 'g1', h.clock.now());
    h.clock.advance(minutes(5));

    expect(await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'round')).toMatchObject({ pushed: 0 });
  });

  it('round: a newly eligible goalkeeper gets the offer created and pushed as a first notification', async () => {
    const h = offerHarness();
    await h.phone('g2');
    const { bookings } = h.match('r1');

    const report = await h.sender.send(new Map([['g2', bookings]]), h.clock.now(), 'round');

    expect(report).toMatchObject({ entriesCreated: 1, pushed: 1, reached: 1 });
    expect(h.notifications.all()[0]).toMatchObject({ notifiedAt: h.clock.now(), reminderCount: 0 });
  });

  it('round: stops after the maximum number of reminders', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const { bookings } = h.match('r1', 30);
    await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');

    let pushes = 0;
    for (let round = 0; round < 5; round += 1) {
      h.clock.advance(minutes(5));
      pushes += (await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'round')).pushed;
    }

    expect(pushes).toBe(3);
    expect(h.notifications.all()[0]!.reminderCount).toBe(3);
  });

  it('catchUp: pushes only offers the goalkeeper did not have, and never re-counts old ones', async () => {
    const h = offerHarness();
    await h.phone('g1');
    const old = h.match('r-old');
    const fresh = h.match('r-new', 5);
    await h.sender.send(new Map([['g1', old.bookings]]), h.clock.now(), 'first');

    const report = await h.sender.send(new Map([['g1', [...old.bookings, ...fresh.bookings]]]), h.clock.now(), 'catchUp');

    expect(report).toMatchObject({ entriesCreated: 1, pushed: 1 });
    expect(h.pushSender.calls.at(-1)!.message.data).toMatchObject({ requestId: 'r-new' });
    expect(h.notifications.all().map((offer) => offer.reminderCount)).toEqual([0, 0]);
  });

  it('shares one push call between goalkeepers who get the same message', async () => {
    const h = offerHarness();
    await h.phone('g1');
    await h.phone('g2');
    const { bookings } = h.match('r1');

    await h.sender.send(new Map([['g1', bookings], ['g2', bookings]]), h.clock.now(), 'first');

    expect(h.pushSender.calls.map((call) => call.userId).sort()).toEqual(['g1', 'g2']);
    expect(new Set(h.pushSender.calls.map((call) => JSON.stringify(call.message))).size).toBe(1);
  });

  it('never throws: a failure is logged and the partial report returned', async () => {
    const h = offerHarness();
    const { bookings } = h.match('r1');
    h.notifications.createOfferIfAbsent = async () => {
      throw new Error('mongo down');
    };

    await expect(h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first')).resolves.toMatchObject({ entriesCreated: 0 });
  });
});
