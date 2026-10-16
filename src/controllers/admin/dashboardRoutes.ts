import type { ISender } from '../../application/common/mediator/types.js';
import { GetDashboardAreasQuery } from '../../application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQuery.js';
import { GetDashboardSummaryQuery } from '../../application/features/dashboard/queries/getDashboardSummary/getDashboardSummaryQuery.js';
import { ApiError } from '../apiError.js';
import { dashboardSummaryQuerySchema } from '../requests/dashboard/dashboardRequests.js';
import { invalidFields, notFound, parse, type Route } from './geographyRoutes.js';
import { marketScopeCriteria } from './scopeCriteria.js';

/**
 * The dashboard's numbers (admin spec 008, contracts/dashboard-system-api.md §1): one read, the
 * areas the member's permissions allow. Counts only, so it is not a sensitive read.
 */
export function registerDashboardRoutes(route: Route, mediator: ISender): void {
  // The countries and cities the scope filter picks from, with dashboard.read alone.
  route('get', '/dashboard/areas', 'dashboard.read', async (_req, res) => {
    res.status(200).json(await mediator.send(new GetDashboardAreasQuery()));
  });

  route('get', '/dashboard/summary', 'dashboard.read', async (req, res) => {
    parse(dashboardSummaryQuerySchema, req.query);
    const result = await mediator.send(new GetDashboardSummaryQuery(marketScopeCriteria(req), req.adminAccess!.permissions));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'ok':
        res.status(200).json(result.summary);
        return;
      case 'invalid':
        throw invalidFields({ marketId: 'A market needs its country.' });
      case 'market_not_in_country':
        throw new ApiError(400, 'market_not_in_country', 'This market is not in that country.');
      case 'country_not_found':
        throw notFound('country_not_found');
      case 'market_not_found':
        throw notFound('market_not_found');
    }
  });
}
