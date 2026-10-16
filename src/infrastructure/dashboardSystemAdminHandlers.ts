import type { IClock } from '../application/common/clock.js';
import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import { dashboardGeography } from '../application/features/dashboard/common/geography.js';
import type { IDashboardLogger, IDashboardReader } from '../application/features/dashboard/common/ports.js';
import { GetDashboardAreasQuery } from '../application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQuery.js';
import { GetDashboardAreasQueryHandler } from '../application/features/dashboard/queries/getDashboardAreas/getDashboardAreasQueryHandler.js';
import { GetDashboardSummaryQuery } from '../application/features/dashboard/queries/getDashboardSummary/getDashboardSummaryQuery.js';
import { GetDashboardSummaryQueryHandler } from '../application/features/dashboard/queries/getDashboardSummary/getDashboardSummaryQueryHandler.js';
import type { IJobLockReader, IOutboxAdminReader } from '../application/features/events/common/adminPorts.js';
import type { IOutboxStore, IScheduledJob } from '../application/features/events/common/ports.js';
import { GetSystemEventsQuery } from '../application/features/events/queries/getSystemEvents/getSystemEventsQuery.js';
import { GetSystemEventsQueryHandler } from '../application/features/events/queries/getSystemEvents/getSystemEventsQueryHandler.js';
import { GetSystemJobsQuery } from '../application/features/events/queries/getSystemJobs/getSystemJobsQuery.js';
import { GetSystemJobsQueryHandler } from '../application/features/events/queries/getSystemJobs/getSystemJobsQueryHandler.js';
import { GetSystemHealthQuery, type HealthReport } from '../application/features/system/queries/getSystemHealth/getSystemHealthQuery.js';
import { GetSystemHealthQueryHandler } from '../application/features/system/queries/getSystemHealth/getSystemHealthQueryHandler.js';
import { GetSystemParametersQuery } from '../application/features/system/queries/getSystemParameters/getSystemParametersQuery.js';
import { GetSystemParametersQueryHandler, type SystemParametersDependencies } from '../application/features/system/queries/getSystemParameters/getSystemParametersQueryHandler.js';
import type { IAdminCountryRepository } from '../application/features/geography/common/ports.js';
import type { IAdminMarketRepository } from '../application/features/markets/common/ports.js';

/** What the admin's dashboard and system reads need (porteros-pro-admin spec 008). */
export interface DashboardSystemHandlerDependencies {
  dashboardReader: IDashboardReader;
  countries: Pick<IAdminCountryRepository, 'getById' | 'list'>;
  markets: Pick<IAdminMarketRepository, 'getById' | 'listByCountry' | 'list'>;
  clock: IClock;
  logger: IDashboardLogger;
  outbox: IOutboxAdminReader & Pick<IOutboxStore, 'pendingStats'>;
  /** The sweep's own list (research §8). */
  jobs: readonly Pick<IScheduledJob, 'name' | 'leaseSeconds'>[];
  jobLocks: IJobLockReader;
  /** The same check as `/health`. */
  checkHealth: () => Promise<HealthReport>;
  /** `config.events.pendingWarningMinutes`: when a pending event counts as stuck. */
  stuckAfterMinutes: number;
  parameters: Omit<SystemParametersDependencies, 'countries'>;
}

/**
 * The admin web's dashboard and system handlers, shared by the composition root and the HTTP
 * tests' fake-backed one so both register exactly the same set.
 */
export function dashboardSystemHandlerRegistrations(deps: DashboardSystemHandlerDependencies): HandlerRegistration[] {
  const geography = dashboardGeography(deps);
  return [
    { requestType: GetDashboardAreasQuery, handler: new GetDashboardAreasQueryHandler(deps) },
    {
      requestType: GetDashboardSummaryQuery,
      handler: new GetDashboardSummaryQueryHandler({ reader: deps.dashboardReader, geography, clock: deps.clock, logger: deps.logger }),
    },
    {
      requestType: GetSystemEventsQuery,
      handler: new GetSystemEventsQueryHandler({ outbox: deps.outbox, stats: deps.outbox, clock: deps.clock, stuckAfterMinutes: deps.stuckAfterMinutes }),
    },
    { requestType: GetSystemJobsQuery, handler: new GetSystemJobsQueryHandler({ jobs: deps.jobs, locks: deps.jobLocks, clock: deps.clock }) },
    { requestType: GetSystemParametersQuery, handler: new GetSystemParametersQueryHandler({ ...deps.parameters, countries: deps.countries }) },
    { requestType: GetSystemHealthQuery, handler: new GetSystemHealthQueryHandler({ checkHealth: deps.checkHealth, clock: deps.clock }) },
  ];
}
