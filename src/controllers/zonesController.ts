import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetZonesByMarketQuery } from '../application/features/zones/queries/getZonesByMarket/getZonesByMarketQuery.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { ApiError } from './apiError.js';

export interface ZonesControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

/** Authenticated, but no goalkeeper-profile requirement — public geographic reference data (research.md §6). */
export function createZonesController(deps: ZonesControllerDependencies): Router {
  const router = Router();

  router.get('/', requireAuth(deps.verifyAccessToken), async (req, res) => {
    const marketId = typeof req.query.marketId === 'string' ? req.query.marketId : '';
    const result = await deps.mediator.send(new GetZonesByMarketQuery(marketId));

    switch (result.outcome) {
      case 'success':
        res.status(200).json({ zones: result.zones });
        return;
      case 'market_not_found':
        throw new ApiError(404, 'market_not_found', 'The requested market does not exist or is not open.');
      case 'no_zones_configured':
        throw new ApiError(404, 'no_zones_configured', 'No service zones are configured for this market yet.');
    }
  });

  return router;
}
