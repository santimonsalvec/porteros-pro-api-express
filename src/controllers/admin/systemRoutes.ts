import type { ISender } from '../../application/common/mediator/types.js';
import { GetSystemEventsQuery } from '../../application/features/events/queries/getSystemEvents/getSystemEventsQuery.js';
import { GetSystemJobsQuery } from '../../application/features/events/queries/getSystemJobs/getSystemJobsQuery.js';
import { GetSystemParametersQuery } from '../../application/features/system/queries/getSystemParameters/getSystemParametersQuery.js';
import { GetSystemHealthQuery } from '../../application/features/system/queries/getSystemHealth/getSystemHealthQuery.js';
import { noQuerySchema, systemEventsQuerySchema } from '../requests/system/systemRequests.js';
import { parse, type Route } from './geographyRoutes.js';

/**
 * Sistema (admin spec 008, contracts/dashboard-system-api.md §2–§5): technical reads only, with
 * `system.read`, never a secret nor an event's payload. Not sensitive reads, so not audited.
 */
export function registerSystemRoutes(route: Route, mediator: ISender): void {
  // 200 also when unhealthy: the screen shows it as data. The public `/health` keeps its 503.
  route('get', '/system/health', 'system.read', async (req, res) => {
    parse(noQuerySchema, req.query);
    res.status(200).json(await mediator.send(new GetSystemHealthQuery()));
  });

  route('get', '/system/events', 'system.read', async (req, res) => {
    res.status(200).json(await mediator.send(new GetSystemEventsQuery(parse(systemEventsQuerySchema, req.query))));
  });

  route('get', '/system/jobs', 'system.read', async (req, res) => {
    parse(noQuerySchema, req.query);
    res.status(200).json(await mediator.send(new GetSystemJobsQuery()));
  });

  // Values and `present` only: a secret's value never reaches this answer.
  route('get', '/system/parameters', 'system.read', async (req, res) => {
    parse(noQuerySchema, req.query);
    res.status(200).json(await mediator.send(new GetSystemParametersQuery()));
  });
}
