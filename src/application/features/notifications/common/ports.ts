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
  /** Set on notices written once per key (feature 016 onwards). */
  dedupeKey?: string;
  /**
   * When the user deleted it from their inbox (feature 025); null while visible. A deleted entry
   * stays stored, so it still dedupes, still counts as "offered" and is never pushed again.
   */
  deletedAt: Date | null;
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

/** Any inbox entry that is not an offer (feature 016 onwards). */
export interface NewNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: Date;
  /** At most one entry per key, so a notice is written once whatever the deliveries. */
  dedupeKey: string;
}

export type DismissOutcome = 'dismissed' | 'not_found' | 'not_an_offer';

export interface INotificationRepository {
  /** False when the goalkeeper already has an offer for that request (FR-005). */
  createOfferIfAbsent(offer: NewOffer): Promise<boolean>;
  /**
   * The offer of a replacement booking (feature 018): the goalkeeper's offer for the request is
   * reopened in place (new text and booking, unread, never pushed) or created when there is none.
   * Returns the id of the entry reopened or created, or null when it already offers this booking.
   */
  renewOffer(offer: NewOffer): Promise<string | null>;
  /** False when an entry with the same `dedupeKey` exists already. */
  createIfAbsent(entry: NewNotification): Promise<boolean>;
  /** The user's visible entries, newest first; deleted ones are left out, as in the counts. */
  listForUser(userId: string, skip: number, limit: number): Promise<NotificationItem[]>;
  countForUser(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
  /** False when the entry doesn't exist or belongs to someone else. Keeps an earlier `readAt`. */
  markRead(id: string, userId: string, now: Date): Promise<boolean>;
  markAllRead(userId: string, now: Date): Promise<void>;
  /**
   * Hides the entry from the user's inbox and marks it read (feature 025). True when it is deleted
   * now or was already; false when it doesn't exist or belongs to someone else.
   */
  deleteForUser(id: string, userId: string, now: Date): Promise<boolean>;
  /** Deletes every visible entry of the user created at or before `before`; returns how many. */
  deleteAllForUser(userId: string, before: Date, now: Date): Promise<number>;
  dismissOffer(id: string, userId: string, now: Date): Promise<DismissOutcome>;
  findOffers(userIds: readonly string[], requestIds: readonly string[]): Promise<NotificationItem[]>;
  /** Everyone who was offered a match of the request, once each. */
  findOfferRecipients(requestId: string): Promise<string[]>;
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
