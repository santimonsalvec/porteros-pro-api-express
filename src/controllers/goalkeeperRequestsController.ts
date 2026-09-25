import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import type { MissingSetting } from '../application/features/goalkeeperRequests/common/resolveBookingSettings.js';
import { parseStartsAt } from '../application/features/goalkeeperRequests/common/startsAt.js';
import { GetBookingConfigQuery } from '../application/features/goalkeeperRequests/queries/getBookingConfig/getBookingConfigQuery.js';
import { GetServiceQuoteQuery } from '../application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { logger } from '../infrastructure/observability/logger.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { requireClientOnly } from '../infrastructure/auth/middleware/requireClientOnly.js';
import { requireCompleteProfile } from '../infrastructure/auth/middleware/requireCompleteProfile.js';
import { ApiError } from './apiError.js';
import { getBookingConfigRequestSchema } from './requests/goalkeeperRequests/getBookingConfigRequest.js';
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
 * The goalkeeper-request resource, for now read-only: `GET /config` (what a client may pick for a
 * pitch) and `POST /quote` (the price of a booking) — the pieces the find-goalkeeper flow builds on.
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
      new GetServiceQuoteQuery({
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

  return router;
}
