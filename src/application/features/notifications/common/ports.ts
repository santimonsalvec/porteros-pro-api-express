/** One message in a user's inbox (feature 015; feature 019 adds client types). */
export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: Date;
  /** For an offer, read means opened: it is never reminded again. */
  readAt: Date | null;
  /** Offers only; null for other types. */
  requestId: string | null;
  dismissedAt: Date | null;
  /** When the offer's first push went out; null while it was created but not pushed yet. */
  notifiedAt: Date | null;
  reminderCount: number;
  lastRemindedAt: Date | null;
}

/** A new offer entry: one per goalkeeper and request. */
export interface NewOffer {
  id: string;
  userId: string;
  requestId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: Date;
}

export type DismissOutcome = 'dismissed' | 'not_found' | 'not_an_offer';

export interface INotificationRepository {
  /** False when the goalkeeper already has an offer for that request (FR-005). */
  createOfferIfAbsent(offer: NewOffer): Promise<boolean>;
  listForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]>;
  countForUser(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
  /** False when the entry doesn't exist or belongs to someone else. Keeps an earlier `readAt`. */
  markRead(id: string, userId: string, now: Date): Promise<boolean>;
  markAllRead(userId: string, now: Date): Promise<void>;
  dismissOffer(id: string, userId: string, now: Date): Promise<DismissOutcome>;
  findOffers(userIds: readonly string[], requestIds: readonly string[]): Promise<NotificationItem[]>;
  /** Sets `notifiedAt` on the given offers that don't have it yet. */
  markNotified(ids: readonly string[], now: Date): Promise<void>;
  /** Counts one reminder on each given offer. */
  markReminded(ids: readonly string[], now: Date): Promise<void>;
}

/** When each goalkeeper was last pushed an offer, so rounds keep pushes apart (FR-009, FR-012). */
export interface IOfferPushState {
  /** Atomically takes the goalkeeper for this round, only when their last push is old enough. */
  tryClaim(goalkeeperId: string, now: Date, intervalMinutes: number): Promise<boolean>;
  /** Records a push that didn't need a claim (first notification, catch-up). */
  markPushed(goalkeeperIds: readonly string[], now: Date): Promise<void>;
}

/** The logging offers need, so the application never imports pino. */
export interface IOffersLogger {
  info(entry: Record<string, unknown>, message: string): void;
  warn(entry: Record<string, unknown>, message: string): void;
}
