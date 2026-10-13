import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';

/** One notice as the admin shows it (contracts/operations-api.md §11): never a token, never a device. */
export interface UserNotificationItem {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  deletedAt: string | null;
  requestId: string | null;
  /** Offers record their pushes; every other notice is pushed right when it is created (research §11). */
  push: { kind: 'offer'; notifiedAt: string | null; reminderCount: number; lastRemindedAt: string | null } | { kind: 'on_create' };
}

export type ListUserNotificationsAdminResult =
  | { outcome: 'ok'; page: Page<UserNotificationItem>; devices: { count: number; lastSeenAt: string | null } }
  | { outcome: 'user_not_found' };

/** A user's notices, the deleted ones included, newest first (admin spec 006, US3). */
export class ListUserNotificationsAdminQuery extends IQuery<ListUserNotificationsAdminResult> {
  constructor(
    readonly userId: string,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
