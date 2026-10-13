import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { OFFER_TYPE } from '../../../../../domain/notifications/offerMessages.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { pageOf } from '../../../geography/common/views.js';
import type { INotificationAdminReader } from '../../common/adminPorts.js';
import type { NotificationItem } from '../../common/ports.js';
import {
  ListUserNotificationsAdminQuery,
  type ListUserNotificationsAdminResult,
  type UserNotificationItem,
} from './listUserNotificationsAdminQuery.js';

export interface ListUserNotificationsAdminDependencies {
  reader: INotificationAdminReader;
  users: Pick<IUserRepository, 'getById'>;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

export class ListUserNotificationsAdminQueryHandler implements IQueryHandler<ListUserNotificationsAdminQuery, ListUserNotificationsAdminResult> {
  constructor(private readonly deps: ListUserNotificationsAdminDependencies) {}

  async handle({ userId, page, pageSize }: ListUserNotificationsAdminQuery): Promise<ListUserNotificationsAdminResult> {
    if (!(await this.deps.users.getById(userId))) return { outcome: 'user_not_found' };
    const [items, totalItems, devices] = await Promise.all([
      this.deps.reader.listAllForUser(userId, (page - 1) * pageSize, pageSize),
      this.deps.reader.countAllForUser(userId),
      this.deps.reader.devicesOf(userId),
    ]);
    return {
      outcome: 'ok',
      page: pageOf(items.map(toView), page, pageSize, totalItems),
      devices: { count: devices.count, lastSeenAt: iso(devices.lastSeenAt) },
    };
  }
}

function toView(item: NotificationItem): UserNotificationItem {
  return {
    notificationId: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    createdAt: item.createdAt.toISOString(),
    readAt: iso(item.readAt),
    dismissedAt: iso(item.dismissedAt),
    deletedAt: iso(item.deletedAt),
    requestId: item.requestId ?? item.data.requestId ?? null,
    push:
      item.type === OFFER_TYPE
        ? { kind: 'offer', notifiedAt: iso(item.notifiedAt), reminderCount: item.reminderCount, lastRemindedAt: iso(item.lastRemindedAt) }
        : { kind: 'on_create' },
  };
}
