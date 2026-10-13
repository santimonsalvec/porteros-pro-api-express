import type { ISender } from '../../application/common/mediator/types.js';
import { ListRatingsAdminQuery } from '../../application/features/ratings/queries/listRatingsAdmin/listRatingsAdminQuery.js';
import { listRatingsQuerySchema } from '../requests/ratings/ratingAdminRequests.js';
import { parse, type Route } from './geographyRoutes.js';

/** Ratings in the admin web (spec 006 of the admin, contracts/operations-api.md §10), read with `ratings.read`. */
export function registerRatingsRoutes(route: Route, mediator: ISender): void {
  route('get', '/ratings', 'ratings.read', async (req, res) => {
    const result = await mediator.send(new ListRatingsAdminQuery(parse(listRatingsQuerySchema, req.query)));
    res.status(200).json(result.page);
  });
}
