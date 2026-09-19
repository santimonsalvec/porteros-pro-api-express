import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetZonesByCityQuery } from '../application/features/zones/queries/getZonesByCity/getZonesByCityQuery.js';
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
    const cityId = typeof req.query.cityId === 'string' ? req.query.cityId : '';
    const result = await deps.mediator.send(new GetZonesByCityQuery(cityId));

    switch (result.outcome) {
      case 'success':
        res.status(200).json({ zones: result.zones });
        return;
      case 'city_not_found':
        throw new ApiError(404, 'city_not_found', 'The requested city does not exist.');
      case 'no_zones_configured':
        throw new ApiError(404, 'no_zones_configured', 'No service zones are configured for this city yet.');
    }
  });

  return router;
}
