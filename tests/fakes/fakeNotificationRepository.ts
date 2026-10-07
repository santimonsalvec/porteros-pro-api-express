import type {
  DismissOutcome,
  INotificationRepository,
  NewNotification,
  NewOffer,
  NotificationItem,
} from '../../src/application/features/notifications/common/ports.js';
import { OFFER_TYPE } from '../../src/domain/notifications/offerMessages.js';

/** In-memory inbox with `MongoNotificationRepository`'s semantics (one offer per user + request). */
export class FakeNotificationRepository implements INotificationRepository {
  private readonly items = new Map<string, NotificationItem>();

  async createOfferIfAbsent(offer: NewOffer): Promise<boolean> {
    const exists = [...this.items.values()].some(
      (item) => item.type === OFFER_TYPE && item.userId === offer.userId && item.requestId === offer.requestId,
    );
    if (exists) return false;
    this.items.set(offer.id, {
      ...offer,
      type: OFFER_TYPE,
      readAt: null,
      dismissedAt: null,
      notifiedAt: null,
      reminderCount: 0,
      lastRemindedAt: null,
      deletedAt: null,
    });
    return true;
  }

  async renewOffer(offer: NewOffer): Promise<string | null> {
    const existing = [...this.items.values()].find(
      (item) => item.type === OFFER_TYPE && item.userId === offer.userId && item.requestId === offer.requestId,
    );
    if (!existing) return (await this.createOfferIfAbsent(offer)) ? offer.id : null;
    if (existing.data.bookingId === offer.data.bookingId) return null;
    Object.assign(existing, {
      title: offer.title,
      body: offer.body,
      data: offer.data,
      createdAt: offer.createdAt,
      readAt: null,
      dismissedAt: null,
      notifiedAt: null,
      reminderCount: 0,
      lastRemindedAt: null,
      deletedAt: null,
    });
    return existing.id;
  }

  async createIfAbsent(entry: NewNotification): Promise<boolean> {
    if ([...this.items.values()].some((item) => item.dedupeKey === entry.dedupeKey)) return false;
    this.items.set(entry.id, {
      ...entry,
      readAt: null,
      requestId: null,
      dismissedAt: null,
      notifiedAt: null,
      reminderCount: 0,
      lastRemindedAt: null,
      deletedAt: null,
    });
    return true;
  }

  /** Test helper: stores any entry as-is (e.g. a non-offer type). */
  seed(item: Omit<NotificationItem, 'deletedAt'> & { deletedAt?: Date | null }): void {
    this.items.set(item.id, { deletedAt: null, ...item });
  }

  async listForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]> {
    return this.forUser(userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(skip, skip + limit)
      .map((item) => ({ ...item }));
  }

  async countForUser(userId: string): Promise<number> {
    return this.forUser(userId).length;
  }

  async countUnread(userId: string): Promise<number> {
    return this.forUser(userId).filter((item) => item.readAt === null).length;
  }

  async markRead(id: string, userId: string, now: Date): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) return false;
    item.readAt ??= now;
    return true;
  }

  async markAllRead(userId: string, now: Date): Promise<void> {
    for (const item of this.forUser(userId)) item.readAt ??= now;
  }

  async deleteForUser(id: string, userId: string, now: Date): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) return false;
    item.deletedAt ??= now;
    item.readAt ??= now;
    return true;
  }

  async deleteAllForUser(userId: string, before: Date, now: Date): Promise<number> {
    const toDelete = this.forUser(userId).filter((item) => item.createdAt.getTime() <= before.getTime());
    for (const item of toDelete) {
      item.deletedAt = now;
      item.readAt ??= now;
    }
    return toDelete.length;
  }

  async dismissOffer(id: string, userId: string, now: Date): Promise<DismissOutcome> {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) return 'not_found';
    if (item.type !== OFFER_TYPE) return 'not_an_offer';
    item.readAt ??= now;
    item.dismissedAt ??= now;
    return 'dismissed';
  }

  async findOffers(userIds: readonly string[], requestIds: readonly string[]): Promise<NotificationItem[]> {
    return [...this.items.values()]
      .filter((item) => item.type === OFFER_TYPE && userIds.includes(item.userId) && requestIds.includes(item.requestId ?? ''))
      .map((item) => ({ ...item }));
  }

  async findOfferRecipients(requestId: string): Promise<string[]> {
    const items = [...this.items.values()].filter((item) => item.type === OFFER_TYPE && item.requestId === requestId);
    return [...new Set(items.map((item) => item.userId))];
  }

  async markNotified(ids: readonly string[], now: Date): Promise<void> {
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) item.notifiedAt ??= now;
    }
  }

  async markReminded(ids: readonly string[], now: Date): Promise<void> {
    for (const id of ids) {
      const item = this.items.get(id);
      if (!item) continue;
      item.reminderCount += 1;
      item.lastRemindedAt = now;
    }
  }

  all(): NotificationItem[] {
    return [...this.items.values()].map((item) => ({ ...item }));
  }

  /** The user's visible entries, as the inbox reads them. */
  private forUser(userId: string): NotificationItem[] {
    return [...this.items.values()].filter((item) => item.userId === userId && item.deletedAt === null);
  }
}
