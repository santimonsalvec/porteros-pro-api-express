import type { Request } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { SendTestPushCommand } from '../../application/features/devices/commands/sendTestPush/sendTestPushCommand.js';
import { ListUserNotificationsAdminQuery } from '../../application/features/notifications/queries/listUserNotificationsAdmin/listUserNotificationsAdminQuery.js';
import { GetUserQuery } from '../../application/features/users/queries/getUser/getUserQuery.js';
import { ApiError } from '../apiError.js';
import { listUserNotificationsQuerySchema } from '../requests/notifications/notificationAdminRequests.js';
import { notFound, parse, type Route } from './geographyRoutes.js';

const userIdOf = (req: Request) => String(req.params.userId);

/**
 * A user's notices in the admin web (spec 006 of the admin, contracts/operations-api.md §11–§12):
 * read with `notifications.read`; the test push, with `notifications.send`, is the app's own test
 * push to that user — same message, same limiter and key, so both share the limit.
 */
export function registerNotificationsRoutes(route: Route, mediator: ISender): void {
  route('get', '/notifications', 'notifications.read', async (req, res) => {
    const { userId, page, pageSize } = parse(listUserNotificationsQuerySchema, req.query);
    const result = await mediator.send(new ListUserNotificationsAdminQuery(userId, page, pageSize));
    if (result.outcome === 'user_not_found') throw notFound('user_not_found');
    res.status(200).json({ ...result.page, devices: result.devices });
  });

  route(
    'post',
    '/users/:userId/test-push',
    { permission: 'notifications.send', audit: { action: 'user.test_push', resourceType: 'user', resourceId: userIdOf } },
    async (req, res) => {
      const user = await mediator.send(new GetUserQuery(userIdOf(req)));
      if (user.outcome === 'not_found') throw notFound('user_not_found');
      const result = await mediator.send(new SendTestPushCommand(userIdOf(req)));
      // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
      switch (result.outcome) {
        case 'sent':
          res.status(200).json(result.result);
          return;
        case 'rate_limited':
          res.setHeader('Retry-After', String(result.retryAfterSeconds));
          throw new ApiError(429, 'too_many_requests', 'Too many test pushes; try again shortly.', undefined, {
            retryAfterSeconds: result.retryAfterSeconds,
          });
      }
    },
  );
}
