import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetCountriesQuery } from '../application/features/locations/queries/getCountries/getCountriesQuery.js';
import { GetCitiesQuery } from '../application/features/locations/queries/getCities/getCitiesQuery.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';

export interface LocationsControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

export function createLocationsController(deps: LocationsControllerDependencies): Router {
  const router = Router();

  /** Public, non-sensitive reference data — requires no authentication. */
  router.get('/countries', async (_req, res) => {
    const result = await deps.mediator.send(new GetCountriesQuery());
    res.status(200).json({ countries: result.countries });
  });

  /** Authenticated, but no goalkeeper-profile requirement — any signed-in client can search (research.md §6). */
  router.get('/cities', requireAuth(deps.verifyAccessToken), async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const result = await deps.mediator.send(new GetCitiesQuery(q));
    res.status(200).json({ cities: result.cities });
  });

  return router;
}
