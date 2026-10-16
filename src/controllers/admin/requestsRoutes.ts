import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { GetCheckInPhotoQuery } from '../../application/features/goalkeeperRequests/queries/getCheckInPhoto/getCheckInPhotoQuery.js';
import { GetRequestAdminQuery } from '../../application/features/goalkeeperRequests/queries/getRequestAdmin/getRequestAdminQuery.js';
import { ListRequestsAdminQuery } from '../../application/features/goalkeeperRequests/queries/listRequestsAdmin/listRequestsAdminQuery.js';
import { CancelBookingsByAdminCommand } from '../../application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommand.js';
import { ApiError } from '../apiError.js';
import { adminCancelRequestSchema, listRequestsQuerySchema } from '../requests/requests/requestAdminRequests.js';
import { invalidFields, notFound, parse, type Route } from './geographyRoutes.js';
import { canSeeMarket, marketScopeCriteria } from './scopeCriteria.js';

const requestIdOf = (req: Request) => String(req.params.requestId);
const bookingIdOf = (req: Request) => String(req.params.bookingId);

/**
 * Requests in the admin web (spec 006 of the admin, contracts/operations-api.md §1–§5): read with
 * `requests.read`, cancelled with `requests.cancel`. The check-in photo is a sensitive read of its own.
 */
export function registerRequestsRoutes(route: Route, mediator: ISender): void {
  route('get', '/requests', 'requests.read', async (req, res) => {
    const result = await mediator.send(new ListRequestsAdminQuery({ ...parse(listRequestsQuerySchema, req.query), ...marketScopeCriteria(req) }));
    if (result.outcome === 'search_too_broad') {
      throw new ApiError(400, 'search_too_broad', 'The goalkeeper has too many requests; narrow the dates.');
    }
    res.status(200).json(result.page);
  });

  route('get', '/requests/:requestId', 'requests.read', async (req, res) => {
    const result = await mediator.send(new GetRequestAdminQuery(requestIdOf(req)));
    if (result.outcome === 'request_not_found' || !canSeeMarket(req, result.request.match.market.id)) throw notFound('request_not_found');
    res.status(200).json(result.request);
  });

  route(
    'get',
    '/requests/:requestId/bookings/:bookingId/check-in-photo',
    { permission: 'requests.read', read: { action: 'booking.check_in_photo.read', resourceType: 'booking', resourceId: bookingIdOf } },
    async (req, res) => {
      const result = await mediator.send(new GetCheckInPhotoQuery(bookingIdOf(req), requestIdOf(req)));
      if (result.outcome !== 'ok') throw notFound(result.outcome);
      res.status(200).json(result.photo);
    },
  );

  const cancelled = (action: 'request.cancel' | 'booking.cancel') => ({
    permission: 'requests.cancel' as const,
    audit: {
      action,
      resourceType: 'request',
      resourceId: requestIdOf,
      before: async (request: Request) => {
        const result = await mediator.send(new GetRequestAdminQuery(requestIdOf(request)));
        return result.outcome === 'ok'
          ? { requestId: result.request.requestId, status: result.request.status, bookings: result.request.bookings.map(({ bookingId, status }) => ({ bookingId, status })) }
          : null;
      },
    },
  });

  const cancel = async (req: Request, res: Response, bookingId: string | null) => {
    const { reason } = parse(adminCancelRequestSchema, req.body);
    const result = await mediator.send(new CancelBookingsByAdminCommand(req.adminAccess!.userId, requestIdOf(req), bookingId, reason));
    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'cancelled':
      case 'replayed': {
        if (result.outcome === 'replayed') res.locals.auditOutcome = 'replayed';
        const now = await mediator.send(new GetRequestAdminQuery(requestIdOf(req)));
        res.status(200).json({
          outcome: result.outcome,
          requestId: requestIdOf(req),
          ...(bookingId ? { bookingId } : {}),
          status: now.outcome === 'ok' ? now.request.status : null,
          cancelledBy: 'admin',
          cancelled: result.outcome === 'cancelled' ? result.cancelled : [],
          refunds: result.outcome === 'cancelled' ? result.refunds : 0,
          reason: reason.trim(),
        });
        return;
      }
      case 'invalid_reason':
        throw invalidFields({ reason: 'Must have between 3 and 300 characters.' });
      case 'request_not_found':
        throw notFound('request_not_found');
      case 'booking_not_found':
        throw notFound('booking_not_found');
      case 'not_cancellable':
        throw new ApiError(409, 'booking_not_cancellable', 'This booking has already ended.', undefined, { status: result.status });
      case 'temporarily_unavailable':
        throw new ApiError(503, 'cancellation_temporarily_unavailable', 'The cancellation cannot be completed right now; try again shortly.');
    }
  };

  route('post', '/requests/:requestId/cancel', cancelled('request.cancel'), (req, res) => cancel(req, res, null));
  route('post', '/requests/:requestId/bookings/:bookingId/cancel', cancelled('booking.cancel'), (req, res) => cancel(req, res, bookingIdOf(req)));
}
