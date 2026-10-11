import type { ISender } from '../../application/common/mediator/types.js';
import { GetReadinessQuery } from '../../application/features/geography/queries/getReadiness/getReadinessQuery.js';
import { readinessQuerySchema } from '../requests/geography/geographyRequests.js';
import { notFound, parse, type Route } from './geographyRoutes.js';

/** What a country or a city still needs to quote (spec 003 of the admin, contracts/geography-api.md). Not audited: a read. */
export function registerReadinessRoutes(route: Route, mediator: ISender): void {
  route('get', '/readiness', 'geography.read', async (req, res) => {
    const { countryId, cityId } = parse(readinessQuerySchema, req.query);
    const result = await mediator.send(cityId ? GetReadinessQuery.ofCity(cityId) : GetReadinessQuery.ofCountry(countryId!));
    switch (result.outcome) {
      case 'country':
        res.status(200).json(result.dashboard);
        return;
      case 'city':
        res.status(200).json(result.readiness);
        return;
      case 'country_not_found':
        throw notFound('country_not_found');
      case 'city_not_found':
        throw notFound('city_not_found');
    }
  });
}
