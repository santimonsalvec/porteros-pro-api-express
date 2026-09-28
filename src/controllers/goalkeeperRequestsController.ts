import { Router, type Request, type Response } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import type { MissingSetting } from '../application/features/goalkeeperRequests/common/resolveBookingSettings.js';
import { parseStartsAt } from '../application/features/goalkeeperRequests/common/startsAt.js';
import { GetBookingConfigQuery } from '../application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQuery.js';
import { ConfirmBookingCommand } from '../application/features/goalkeeperRequests/commands/confirmBooking/confirmBookingCommand.js';
import { IssueServiceQuoteCommand } from '../application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommand.js';
import { ListClientRequestsQuery } from '../application/features/goalkeeperRequests/queries/listClientRequests/listClientRequestsQuery.js';
import { logger } from '../infrastructure/observability/logger.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { requireClientOnly } from '../infrastructure/auth/middleware/requireClientOnly.js';
import { requireCompleteProfile } from '../infrastructure/auth/middleware/requireCompleteProfile.js';
import { PARTIAL_FULFILLMENT_DEFAULT } from '../domain/bookings/goalkeeperRequest.js';
import { ApiError } from './apiError.js';
import { cancelRequestSchema } from './requests/goalkeeperRequests/cancelRequest.js';
import { CancelBookingsByClientCommand } from '../application/features/bookingLifecycle/commands/cancelBookingsByClient/cancelBookingsByClientCommand.js';
import { confirmBookingRequestSchema } from './requests/goalkeeperRequests/confirmBookingRequest.js';
import { getBookingConfigRequestSchema } from './requests/goalkeeperRequests/getBookingConfigRequest.js';
import { listClientBookingsRequestSchema } from './requests/goalkeeperRequests/listClientBookingsRequest.js';
import { getServiceQuoteRequestSchema, zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';

export interface GoalkeeperRequestsControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

// The refusals both endpoints share. They are built in one place so `/config` and `/quote` answer
// identically for the same location — a client that gets a 200 from `/config` can rely on `/quote`.

function locationNotCovered(): ApiError {
  return new ApiError(400, 'location_not_covered', 'The location is outside every service zone.');
}

// The 422s mean the business has not set this area up — they are logged so operators notice an
// unconfigured launch area. The response body is unaffected.

function timeZoneNotConfigured(source: string, cityId: string): ApiError {
  logger.warn({ outcome: 'time_zone_not_configured', cityId }, `${source} refused: area not configured`);
  return new ApiError(422, 'time_zone_not_configured', 'The time zone for this area is not configured.');
}

function serviceNotConfigured(source: string, cityId: string, missing: MissingSetting[]): ApiError {
  logger.warn({ outcome: 'service_not_configured', cityId, missing }, `${source} refused: area not configured`);
  return new ApiError(422, 'service_not_configured', 'The service is not configured for this area.', undefined, { missing });
}

/**
 * The goalkeeper-request resource: `GET /config` (what a client may pick for a pitch), `POST /quote`
 * (the price of a booking, held for 3 minutes), `POST /bookings` (turn that quote into a request
 * with one booking per goalkeeper) and `GET /bookings` (the caller's own requests, one page at a time).
 * Authenticated clients with a complete profile, exactly like `/api/goalkeepers/me/*`.
 */
export function createGoalkeeperRequestsController(deps: GoalkeeperRequestsControllerDependencies): Router {
  const router = Router();

  router.use(requireAuth(deps.verifyAccessToken), requireClientOnly(), requireCompleteProfile());

  router.get('/config', async (req, res) => {
    const parsed = getBookingConfigRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }

    const result = await deps.mediator.send(new GetBookingConfigQuery(parsed.data));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.config);
        return;
      case 'location_not_covered':
        throw locationNotCovered();
      case 'time_zone_not_configured':
        throw timeZoneNotConfigured('Booking config', result.cityId);
      case 'service_not_configured':
        throw serviceNotConfigured('Booking config', result.cityId, result.missing);
    }
  });

  router.post('/quote', async (req, res) => {
    const parsed = getServiceQuoteRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const body = parsed.data;

    const result = await deps.mediator.send(
      new IssueServiceQuoteCommand(req.authClaims!.sub, {
        latitude: body.latitude,
        longitude: body.longitude,
        startsAt: parseStartsAt(body.startsAt)!,
        goalkeeperCount: body.goalkeeperCount,
        durationMinutes: body.durationMinutes,
      }),
    );

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'success':
        if (result.freeCancellationDefaulted) {
          // The area has no free-cancellation period: the default was stored. Logged so operations
          // configure it; the response is unaffected (FR-014).
          logger.warn(
            { outcome: 'free_cancellation_not_configured', cityId: result.cityId },
            'Quote issued with the default free-cancellation period',
          );
        }
        if (result.travelBufferDefaulted) {
          logger.warn(
            { outcome: 'travel_buffer_not_configured', cityId: result.cityId },
            'Quote issued with the default travel margin',
          );
        }
        res.status(200).json(result.quote);
        return;
      case 'location_not_covered':
        throw locationNotCovered();
      case 'invalid_start_time':
        throw new ApiError(
          400,
          'invalid_start_time',
          result.reason === 'not_on_slot'
            ? 'The start time must fall exactly on a 30-minute mark (:00 or :30) in the city’s local time.'
            : result.reason === 'nonexistent_local_time'
              ? 'That local time does not exist in the city because of a daylight-saving change.'
              : 'That local time occurs twice in the city because of a daylight-saving change; send an explicit UTC offset.',
          undefined,
          { reason: result.reason },
        );
      case 'start_time_in_past':
        throw new ApiError(400, 'start_time_in_past', 'The start time is in the past.');
      case 'insufficient_notice':
        throw new ApiError(
          400,
          'insufficient_notice',
          'There is not enough time for a goalkeeper to reach the zone.',
          undefined,
          { minNoticeMinutes: result.minNoticeMinutes },
        );
      case 'outside_booking_window':
        throw new ApiError(400, 'outside_booking_window', 'The start time is beyond how far ahead a match can be booked.', undefined, {
          bookingWindowDays: result.bookingWindowDays,
        });
      case 'time_zone_not_configured':
        throw timeZoneNotConfigured('Quote', result.cityId);
      case 'service_not_configured':
        throw serviceNotConfigured('Quote', result.cityId, result.missing);
      case 'rate_not_configured':
        logger.warn(
          { outcome: result.outcome, cityId: result.cityId, zoneId: result.zoneId, durationMinutes: result.durationMinutes },
          'Quote refused: area not configured',
        );
        throw new ApiError(422, 'rate_not_configured', 'No price is configured for this duration in this area.');
    }
  });

  router.post('/bookings', async (req, res) => {
    const parsed = confirmBookingRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }

    const result = await deps.mediator.send(new ConfirmBookingCommand(
        req.authClaims!.sub,
        parsed.data.quoteId,
        parsed.data.partialFulfillment ?? PARTIAL_FULFILLMENT_DEFAULT,
      ));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'created':
        res.status(201).json(result.request);
        return;
      case 'replayed':
        res.status(200).json(result.request);
        return;
      case 'quote_not_found':
        throw new ApiError(404, 'quote_not_found', 'No quote with that id exists for this client; request a new quote.');
      case 'quote_expired':
        throw new ApiError(410, 'quote_expired', 'The quote has expired; request a new quote.');
      case 'duplicate_request':
        throw new ApiError(409, 'duplicate_request', 'You already have a request for this zone and start time.', undefined, {
          requestId: result.existingRequestId,
        });
      case 'confirmation_in_progress':
        res.set('Retry-After', '1');
        throw new ApiError(409, 'confirmation_in_progress', 'This quote is already being confirmed; retry the same request.');
      case 'cancel_all_not_available':
        throw new ApiError(
          409,
          'cancel_all_not_available',
          'This match starts too soon to choose "cancel all"; confirm keeping the confirmed goalkeepers.',
          undefined,
          { cancelAllUntil: result.cancelAllUntil },
        );
    }
  });

  // The client cancels one booking, or the whole request (feature 017).
  const cancel = async (req: Request, res: Response, bookingId: string | null) => {
    const body = cancelRequestSchema.parse(req.body ?? {});
    const result = await deps.mediator.send(
      new CancelBookingsByClientCommand(req.authClaims!.sub, String(req.params.requestId), bookingId, body.reason),
    );
    switch (result.outcome) {
      case 'cancelled':
      case 'replayed':
        res.status(200).json(result.request);
        return;
      case 'request_not_found':
        throw new ApiError(404, 'request_not_found', 'This request does not exist.');
      case 'booking_not_found':
        throw new ApiError(404, 'booking_not_found', 'This booking does not exist in this request.');
      case 'not_cancellable':
        throw new ApiError(409, 'booking_not_cancellable', 'This booking has already ended.', undefined, { status: result.status });
      case 'window_closed':
        throw new ApiError(
          409,
          'cancellation_window_closed',
          'A goalkeeper is already assigned and the free-cancellation period is over: use the goalkeeper or pay them.',
          undefined,
          { bookingId: result.bookingId, freeCancellationUntil: result.freeCancellationUntil },
        );
      case 'temporarily_unavailable':
        res.set('Retry-After', '60');
        throw new ApiError(503, 'cancellation_temporarily_unavailable', 'The cancellation cannot be completed right now; try again shortly.');
      case 'invalid_reason':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { reason: 'reason must have at most 200 characters' });
    }
  };
  router.post('/bookings/:requestId/cancel', (req, res) => cancel(req, res, null));
  router.post('/bookings/:requestId/bookings/:bookingId/cancel', (req, res) => cancel(req, res, String(req.params.bookingId)));

  router.get('/bookings', async (req, res) => {
    const parsed = listClientBookingsRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }

    // The client is the token's subject, never a request parameter (FR-002).
    const result = await deps.mediator.send(
      new ListClientRequestsQuery(req.authClaims!.sub, parsed.data.page, parsed.data.pageSize),
    );
    res.status(200).json(result);
  });

  return router;
}
