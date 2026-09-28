import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { OFFER_TYPE } from '../../../../../domain/notifications/offerMessages.js';
import type { OfferEligibilityService } from '../../common/offerEligibilityService.js';
import type { INotificationRepository, NotificationItem } from '../../common/ports.js';
import { ListNotificationsQuery, type ListNotificationsResult, type NotificationView } from './listNotificationsQuery.js';

export interface ListNotificationsDependencies {
  notifications: INotificationRepository;
  eligibility: OfferEligibilityService;
  clock: IClock;
}

/**
 * The page plus the unread count. When the page has offers, "still available" is answered once
 * for all of them with exactly the "available matches" rules (research §11).
 */
export class ListNotificationsQueryHandler implements IQueryHandler<ListNotificationsQuery, ListNotificationsResult> {
  constructor(private readonly deps: ListNotificationsDependencies) {}

  async handle(query: ListNotificationsQuery): Promise<ListNotificationsResult> {
    const { userId, page, pageSize } = query;
    const [items, totalItems, unreadCount] = await Promise.all([
      this.deps.notifications.listForUser(userId, (page - 1) * pageSize, pageSize),
      this.deps.notifications.countForUser(userId),
      this.deps.notifications.countUnread(userId),
    ]);
    const openRequests = await this.openRequests(userId, items);
    return {
      items: items.map((item) => toView(item, openRequests)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
      unreadCount,
    };
  }

  /** The requests the user can take a booking of right now; empty when the page has no offers. */
  private async openRequests(userId: string, items: readonly NotificationItem[]): Promise<Set<string>> {
    if (!items.some((item) => item.type === OFFER_TYPE)) return new Set();
    const available = await this.deps.eligibility.availableBookingsFor(userId, this.deps.clock.now());
    return new Set(available.kind === 'ok' ? available.bookings.map((booking) => booking.requestId) : []);
  }
}

function toView(item: NotificationItem, openRequests: ReadonlySet<string>): NotificationView {
  const isOffer = item.type === OFFER_TYPE;
  return {
    notificationId: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    data: item.data,
    createdAt: item.createdAt.toISOString(),
    readAt: item.readAt?.toISOString() ?? null,
    dismissedAt: isOffer ? (item.dismissedAt?.toISOString() ?? null) : null,
    stillAvailable: isOffer ? openRequests.has(item.requestId ?? '') : null,
  };
}
