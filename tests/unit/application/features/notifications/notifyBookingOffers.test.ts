import { describe, expect, it, vi } from 'vitest';
import { NotifyBookingOffersCommand } from '../../../../../src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommand.js';
import { NotifyBookingOffersCommandHandler } from '../../../../../src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommandHandler.js';
import { NotifyBookingOffersHandler } from '../../../../../src/application/features/notifications/handlers/notifyBookingOffersHandler.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import type { DomainEvent } from '../../../../../src/domain/events/domainEvent.js';
import { FakeProcessedEventStore } from '../../../../fakes/fakeProcessedEventStore.js';
import { offerHarness } from './offerHarness.js';

function harness() {
  const h = offerHarness();
  const handler = new NotifyBookingOffersCommandHandler({
    bookingRepository: h.bookingRepository,
    eligibility: h.eligibility,
    sender: h.sender,
    clock: h.clock,
    logger: h.silent,
  });
  return { ...h, handler };
}

describe('NotifyBookingOffersCommandHandler', () => {
  it('offers a new booking to exactly the eligible goalkeepers', async () => {
    const h = harness();
    h.goalkeeper('eligible');
    h.goalkeeper('switched-off', { availableForOffers: false });
    h.goalkeeper('suspended', { suspendedUntil: new Date('2026-10-10T00:00:00.000Z') });
    h.goalkeeper('poor', {}, 1000);
    h.goalkeeper('other-zone', { zoneIds: ['zone-copacabana'] });
    for (const id of ['eligible', 'switched-off', 'suspended', 'poor', 'other-zone']) await h.phone(id);
    const { bookings } = h.match('r1', 3, 2);

    const result = await h.handler.handle(new NotifyBookingOffersCommand(bookings[0]!.id));

    expect(result).toMatchObject({ outcome: 'notified', eligible: 1, report: { entriesCreated: 1, reached: 1 } });
    expect(h.notifications.all().map((offer) => offer.userId)).toEqual(['eligible']);
    expect(h.pushSender.calls.map((call) => call.userId)).toEqual(['eligible']);
  });

  it('notifies each goalkeeper once for a 2-goalkeeper request, whichever booking event comes', async () => {
    const h = harness();
    h.goalkeeper('g1');
    await h.phone('g1');
    const { bookings } = h.match('r1', 3, 2);

    await h.handler.handle(new NotifyBookingOffersCommand(bookings[0]!.id));
    await h.handler.handle(new NotifyBookingOffersCommand(bookings[1]!.id));

    expect(h.notifications.all()).toHaveLength(1);
    expect(h.pushSender.calls).toHaveLength(1);
  });

  it('skips a booking that is gone, taken or past its search', async () => {
    const h = harness();
    h.goalkeeper('g1');
    const taken = h.match('r-taken').bookings[0]!;
    h.bookingRepository.seed(Booking.rehydrate({ ...taken, status: 'assigned', goalkeeperId: 'x', assignedAt: h.clock.now() }));
    const late = h.match('r-late', 0.25).bookings[0]!;

    expect(await h.handler.handle(new NotifyBookingOffersCommand('missing'))).toEqual({ outcome: 'skipped', reason: 'not_found' });
    expect(await h.handler.handle(new NotifyBookingOffersCommand(taken.id))).toEqual({ outcome: 'skipped', reason: 'not_open' });
    expect(await h.handler.handle(new NotifyBookingOffersCommand(late.id))).toEqual({ outcome: 'skipped', reason: 'not_open' });
    expect(h.notifications.all()).toHaveLength(0);
  });
});

describe('NotifyBookingOffersHandler', () => {
  it('invokes the command once per event, whatever the number of deliveries', async () => {
    const h = offerHarness();
    const sender = { send: vi.fn().mockResolvedValue({ outcome: 'notified' }) };
    const handler = new NotifyBookingOffersHandler(sender, new FakeProcessedEventStore(), h.clock);
    const event = { id: 'ev-1', type: 'booking.created', bookingId: 'b-1' } as unknown as DomainEvent;

    for (let delivery = 0; delivery < 5; delivery += 1) await handler.handle(event);

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0]![0]).toEqual(new NotifyBookingOffersCommand('b-1'));
  });
});
