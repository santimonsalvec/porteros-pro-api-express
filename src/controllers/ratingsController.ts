import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { RateBookingCommand } from '../application/features/ratings/commands/rateBooking/rateBookingCommand.js';
import { ListPendingRatingsQuery } from '../application/features/ratings/queries/listPendingRatings/listPendingRatingsQuery.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { requireClientOnly } from '../infrastructure/auth/middleware/requireClientOnly.js';
import { requireCompleteProfile } from '../infrastructure/auth/middleware/requireCompleteProfile.js';
import { ApiError } from './apiError.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { rateRequestSchema } from './requests/ratings/rateRequest.js';

export interface RatingsControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

/**
 * The minimal ratings (feature 021): clients rate goalkeepers and goalkeepers rate clients, once
 * per booking. The app asks for pending ones when it opens (no push). Ratings are private.
 */
export function createRatingsController(deps: RatingsControllerDependencies): Router {
  const router = Router();
  router.use(requireAuth(deps.verifyAccessToken), requireClientOnly(), requireCompleteProfile());

  router.get('/pending', async (req, res) => {
    const result = await deps.mediator.send(new ListPendingRatingsQuery(req.authClaims!.sub));
    res.status(200).json({ items: result.items });
  });

  router.post('/bookings/:bookingId', async (req, res) => {
    const parsed = rateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { answer, stars, comment } = parsed.data;
    const result = await deps.mediator.send(new RateBookingCommand(req.authClaims!.sub, req.params.bookingId, answer, stars, comment));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'rated':
        res.status(201).json(result.rating);
        return;
      case 'booking_not_found':
        throw new ApiError(404, 'booking_not_found', 'This booking does not exist or is not yours.');
      case 'already_rated':
        throw new ApiError(409, 'already_rated', 'You already rated this booking.');
      case 'not_rateable':
        throw new ApiError(409, 'not_rateable', 'This booking cannot be rated now.', undefined, { reason: result.reason });
      case 'invalid_rating':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { body: result.message });
    }
  });

  return router;
}
