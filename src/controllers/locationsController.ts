import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetCountriesQuery } from '../application/features/locations/queries/getCountries/getCountriesQuery.js';

export interface LocationsControllerDependencies {
  mediator: ISender;
}

/** Public, non-sensitive reference data — requires no authentication. */
export function createLocationsController(deps: LocationsControllerDependencies): Router {
  const router = Router();

  router.get('/countries', async (_req, res) => {
    const result = await deps.mediator.send(new GetCountriesQuery());
    res.status(200).json({ countries: result.countries });
  });

  return router;
}
