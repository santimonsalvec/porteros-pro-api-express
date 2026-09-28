import { describe, expect, it } from 'vitest';
import { DismissOfferCommand } from '../../../../../src/application/features/notifications/commands/dismissOffer/dismissOfferCommand.js';
import { DismissOfferCommandHandler } from '../../../../../src/application/features/notifications/commands/dismissOffer/dismissOfferCommandHandler.js';
import { MarkAllNotificationsReadCommand } from '../../../../../src/application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommand.js';
import { MarkAllNotificationsReadCommandHandler } from '../../../../../src/application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommandHandler.js';
import { MarkNotificationReadCommand } from '../../../../../src/application/features/notifications/commands/markNotificationRead/markNotificationReadCommand.js';
import { MarkNotificationReadCommandHandler } from '../../../../../src/application/features/notifications/commands/markNotificationRead/markNotificationReadCommandHandler.js';
import { ListNotificationsQuery } from '../../../../../src/application/features/notifications/queries/listNotifications/listNotificationsQuery.js';
import { ListNotificationsQueryHandler } from '../../../../../src/application/features/notifications/queries/listNotifications/listNotificationsQueryHandler.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { offerHarness } from './offerHarness.js';

function harness() {
  const h = offerHarness();
  const list = (userId = 'g1', page = 1, pageSize = 20) =>
    new ListNotificationsQueryHandler({ notifications: h.notifications, eligibility: h.eligibility, clock: h.clock }).handle(
      new ListNotificationsQuery(userId, page, pageSize),
    );
  const read = (id: string, userId = 'g1') => new MarkNotificationReadCommandHandler(h.notifications, h.clock).handle(new MarkNotificationReadCommand(userId, id));
  const readAll = (userId = 'g1') => new MarkAllNotificationsReadCommandHandler(h.notifications, h.clock).handle(new MarkAllNotificationsReadCommand(userId));
  const dismiss = (id: string, userId = 'g1') => new DismissOfferCommandHandler(h.notifications, h.clock).handle(new DismissOfferCommand(userId, id));
  /** Three offers for g1, the newest last. */
  const threeOffers = async () => {
    h.goalkeeper('g1');
    const matches = [h.match('r1', 3), h.match('r2', 6), h.match('r3', 9)];
    for (const { bookings } of matches) {
      await h.sender.send(new Map([['g1', bookings]]), h.clock.now(), 'first');
      h.clock.advance(1000);
    }
    return matches;
  };
  return { ...h, list, read, readAll, dismiss, threeOffers };
}

describe('the inbox', () => {
  it("lists only the caller's entries, newest first, with totals and the unread count", async () => {
    const h = harness();
    await h.threeOffers();
    h.goalkeeper('g2');
    await h.sender.send(new Map([['g2', h.match('r9').bookings]]), h.clock.now(), 'first');

    const page = await h.list('g1', 1, 2);

    expect(page).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2, unreadCount: 3 });
    expect(page.items.map((item) => item.data.requestId)).toEqual(['r3', 'r2']);
    expect(page.items[0]).toMatchObject({ type: 'booking.available', readAt: null, dismissedAt: null, stillAvailable: true });
  });

  it('marks one read (idempotently), all read, and refuses other users', async () => {
    const h = harness();
    await h.threeOffers();
    const [first] = h.notifications.all();

    expect(await h.read(first!.id)).toEqual({ outcome: 'read' });
    expect(await h.read(first!.id)).toEqual({ outcome: 'read' });
    expect((await h.list()).unreadCount).toBe(2);
    expect(await h.read(first!.id, 'someone-else')).toEqual({ outcome: 'not_found' });
    expect(await h.readAll()).toEqual({ outcome: 'done' });
    expect((await h.list()).unreadCount).toBe(0);
  });

  it('dismisses an offer (also read), refuses other types and other users', async () => {
    const h = harness();
    await h.threeOffers();
    const [first] = h.notifications.all();
    h.notifications.seed({ ...first!, id: 'client-note', type: 'request.goalkeeper_assigned', requestId: null });

    expect(await h.dismiss(first!.id)).toEqual({ outcome: 'dismissed' });
    expect(await h.dismiss(first!.id)).toEqual({ outcome: 'dismissed' });
    expect(await h.dismiss('client-note')).toEqual({ outcome: 'not_an_offer' });
    expect(await h.dismiss(first!.id, 'g2')).toEqual({ outcome: 'not_found' });
    const view = (await h.list()).items.find((item) => item.notificationId === first!.id)!;
    expect(view.dismissedAt).not.toBeNull();
    expect(view.readAt).not.toBeNull();
    const note = (await h.list()).items.find((item) => item.notificationId === 'client-note')!;
    expect(note).toMatchObject({ dismissedAt: null, stillAvailable: null });
  });

  it('shows an offer as no longer available once the match was taken, or while offers are off', async () => {
    const h = harness();
    const [taken] = await h.threeOffers();
    h.bookingRepository.seed(Booking.rehydrate({ ...taken!.bookings[0]!, status: 'assigned', goalkeeperId: 'x', assignedAt: h.clock.now() }));

    const byRequest = (items: Awaited<ReturnType<typeof h.list>>['items']) =>
      Object.fromEntries(items.map((item) => [item.data.requestId, item.stillAvailable]));
    expect(byRequest((await h.list()).items)).toEqual({ r1: false, r2: true, r3: true });

    await h.goalkeeperProfileRepository.setAvailableForOffers('g1', false);
    expect(byRequest((await h.list()).items)).toEqual({ r1: false, r2: false, r3: false });
  });

  it('an empty inbox is not an error', async () => {
    expect(await harness().list('nobody')).toEqual({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, unreadCount: 0 });
  });
});
