import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { ListNotificationsQuery } from '../application/features/notifications/queries/listNotifications/listNotificationsQuery.js';
import { MarkNotificationReadCommand } from '../application/features/notifications/commands/markNotificationRead/markNotificationReadCommand.js';
import { MarkAllNotificationsReadCommand } from '../application/features/notifications/commands/markAllNotificationsRead/markAllNotificationsReadCommand.js';
import { DismissOfferCommand } from '../application/features/notifications/commands/dismissOffer/dismissOfferCommand.js';
import { DeleteNotificationCommand } from '../application/features/notifications/commands/deleteNotification/deleteNotificationCommand.js';
import { DeleteAllNotificationsCommand } from '../application/features/notifications/commands/deleteAllNotifications/deleteAllNotificationsCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { listClientBookingsRequestSchema } from './requests/goalkeeperRequests/listClientBookingsRequest.js';
import { deleteAllNotificationsRequestSchema } from './requests/notifications/deleteAllNotificationsRequest.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { ApiError } from './apiError.js';

export interface NotificationsControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

const notFound = (): ApiError => new ApiError(404, 'notification_not_found', 'This notification does not exist.');

/**
 * The inbox (feature 015): any signed-in user, their own entries only. Someone else's entry
 * answers exactly like an unknown one (FR-018).
 */
export function createNotificationsController(deps: NotificationsControllerDependencies): Router {
  const router = Router();
  router.use(requireAuth(deps.verifyAccessToken));

  router.get('/', async (req, res) => {
    const parsed = listClientBookingsRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ListNotificationsQuery(req.authClaims!.sub, parsed.data.page, parsed.data.pageSize));
    res.status(200).json(result);
  });

  // Declared before the `/:id/…` routes so "read-all" and "delete-all" are never taken for an id.
  router.post('/read-all', async (req, res) => {
    await deps.mediator.send(new MarkAllNotificationsReadCommand(req.authClaims!.sub));
    res.status(204).end();
  });

  router.post('/delete-all', async (req, res) => {
    const parsed = deleteAllNotificationsRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new DeleteAllNotificationsCommand(req.authClaims!.sub, parsed.data.before));
    res.status(200).json(result);
  });

  router.post('/:id/read', async (req, res) => {
    const result = await deps.mediator.send(new MarkNotificationReadCommand(req.authClaims!.sub, req.params.id));
    switch (result.outcome) {
      case 'read':
        res.status(204).end();
        return;
      case 'not_found':
        throw notFound();
    }
  });

  // Logical delete (feature 025): idempotent, so a repeat answers 204 as well.
  router.post('/:id/delete', async (req, res) => {
    const result = await deps.mediator.send(new DeleteNotificationCommand(req.authClaims!.sub, req.params.id));
    switch (result.outcome) {
      case 'deleted':
        res.status(204).end();
        return;
      case 'not_found':
        throw notFound();
    }
  });

  router.post('/:id/dismiss', async (req, res) => {
    const result = await deps.mediator.send(new DismissOfferCommand(req.authClaims!.sub, req.params.id));
    switch (result.outcome) {
      case 'dismissed':
        res.status(204).end();
        return;
      case 'not_found':
        throw notFound();
      case 'not_an_offer':
        throw new ApiError(409, 'not_an_offer', 'Only match offers can be dismissed.');
    }
  });

  return router;
}
