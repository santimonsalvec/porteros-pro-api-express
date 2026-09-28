import { IQuery } from '../../../../common/mediator/types.js';

/** One inbox entry as the app sees it (contracts/notifications-and-offers.md). */
export interface NotificationView {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
  readAt: string | null;
  /** Offers only; null for other types. */
  dismissedAt: string | null;
  /** Offers only: the caller can still take a booking of that request now. */
  stillAvailable: boolean | null;
}

export interface ListNotificationsResult {
  items: NotificationView[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  unreadCount: number;
}

/** The caller's inbox, newest first, one page at a time (FR-014). */
export class ListNotificationsQuery extends IQuery<ListNotificationsResult> {
  constructor(
    readonly userId: string,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
