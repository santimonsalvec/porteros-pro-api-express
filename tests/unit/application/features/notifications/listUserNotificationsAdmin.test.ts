import { describe, expect, it } from 'vitest';
import type { NotificationItem } from '../../../../../src/application/features/notifications/common/ports.js';
import { ListUserNotificationsAdminQuery } from '../../../../../src/application/features/notifications/queries/listUserNotificationsAdmin/listUserNotificationsAdminQuery.js';
import { ListUserNotificationsAdminQueryHandler } from '../../../../../src/application/features/notifications/queries/listUserNotificationsAdmin/listUserNotificationsAdminQueryHandler.js';
import type { User } from '../../../../../src/domain/users/user.js';

const AT = new Date('2026-10-18T21:10:00.000Z');
const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'n', userId: 'u-1', type: 'booking.cancelled', title: 'Partido cancelado', body: 'b', data: {}, createdAt: AT, readAt: null,
  requestId: null, dismissedAt: null, notifiedAt: null, reminderCount: 0, lastRemindedAt: null, deletedAt: null, ...overrides,
});

function handler(items: NotificationItem[], exists = true) {
  return new ListUserNotificationsAdminQueryHandler({
    reader: {
      listAllForUser: async (_userId, skip, limit) => items.slice(skip, skip + limit),
      countAllForUser: async () => items.length,
      devicesOf: async () => ({ count: 2, lastSeenAt: AT }),
    },
    users: { getById: async (id) => (exists && id === 'u-1' ? ({ id } as User) : null) },
  });
}

describe("a user's notices for the admin (admin spec 006, US3)", () => {
  it('says how each was pushed: an offer when and how often, any other at creation', async () => {
    const offer = item({ id: 'n-1', type: 'booking.available', requestId: 'r-1', notifiedAt: AT, reminderCount: 2, lastRemindedAt: AT, dismissedAt: AT });
    const cancelled = item({ id: 'n-2', data: { type: 'booking.cancelled', requestId: 'r-2', bookingId: 'b-2' }, readAt: AT, deletedAt: AT });

    const result = await handler([offer, cancelled]).handle(new ListUserNotificationsAdminQuery('u-1', 1, 20));

    expect(result).toEqual({
      outcome: 'ok',
      devices: { count: 2, lastSeenAt: AT.toISOString() },
      page: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        items: [
          {
            notificationId: 'n-1', type: 'booking.available', title: 'Partido cancelado', body: 'b', createdAt: AT.toISOString(),
            readAt: null, dismissedAt: AT.toISOString(), deletedAt: null, requestId: 'r-1',
            push: { kind: 'offer', notifiedAt: AT.toISOString(), reminderCount: 2, lastRemindedAt: AT.toISOString() },
          },
          {
            notificationId: 'n-2', type: 'booking.cancelled', title: 'Partido cancelado', body: 'b', createdAt: AT.toISOString(),
            readAt: AT.toISOString(), dismissedAt: null, deletedAt: AT.toISOString(), requestId: 'r-2',
            push: { kind: 'on_create' },
          },
        ],
      },
    });
  });

  it('pages, and answers user_not_found for nobody', async () => {
    const many = Array.from({ length: 3 }, (_, index) => item({ id: `n-${index}` }));
    const second = await handler(many).handle(new ListUserNotificationsAdminQuery('u-1', 2, 2));
    expect(second).toMatchObject({ outcome: 'ok', page: { page: 2, totalItems: 3, totalPages: 2, items: [{ notificationId: 'n-2' }] } });

    expect(await handler(many, false).handle(new ListUserNotificationsAdminQuery('u-1', 1, 20))).toEqual({ outcome: 'user_not_found' });
  });
});
