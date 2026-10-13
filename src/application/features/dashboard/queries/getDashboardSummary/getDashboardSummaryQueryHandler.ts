import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { AREA_PERMISSIONS, DASHBOARD_AREAS, type DashboardArea } from '../../common/areas.js';
import type { DashboardReadContext, IDashboardGeography, IDashboardLogger, IDashboardReader } from '../../common/ports.js';
import { resolveDashboardScope } from '../../common/scope.js';
import { dashboardWindows } from '../../common/windows.js';
import { GetDashboardSummaryQuery, type DashboardSummary, type GetDashboardSummaryResult } from './getDashboardSummaryQuery.js';

export interface DashboardDependencies {
  reader: IDashboardReader;
  geography: IDashboardGeography;
  clock: IClock;
  logger: IDashboardLogger;
}

/**
 * One call for the whole dashboard (research §1): the scope once, then every area the member's
 * permissions allow, side by side. An area that throws is `failed` and the others still answer.
 */
export class GetDashboardSummaryQueryHandler implements IQueryHandler<GetDashboardSummaryQuery, GetDashboardSummaryResult> {
  constructor(private readonly deps: DashboardDependencies) {}

  async handle({ filter, permissions }: GetDashboardSummaryQuery): Promise<GetDashboardSummaryResult> {
    const resolved = await resolveDashboardScope(this.deps.geography, filter);
    if (resolved.outcome !== 'ok') return resolved;
    const { scope } = resolved;
    const now = this.deps.clock.now();
    const windows = dashboardWindows(scope.timeZone, now);

    let goalkeeperIds: Promise<string[] | null> | undefined;
    const context: DashboardReadContext = {
      scope,
      windows,
      now,
      goalkeeperIds: () => (goalkeeperIds ??= scope.cityIds === null ? Promise.resolve(null) : this.deps.reader.goalkeeperIdsInCities(scope.cityIds)),
    };

    const visible = DASHBOARD_AREAS.filter((area) => permissions.includes(AREA_PERMISSIONS[area]));
    const settled = await Promise.allSettled(visible.map((area) => this.read(area, context)));
    const areas: DashboardSummary['areas'] = {};
    settled.forEach((result, index) => {
      const area = visible[index]!;
      if (result.status === 'fulfilled') {
        Object.assign(areas, { [area]: { status: 'ok', ...result.value } });
      } else {
        this.deps.logger.warn({ outcome: 'dashboard_area_failed', area, err: result.reason }, 'A dashboard area could not be computed');
        Object.assign(areas, { [area]: { status: 'failed' } });
      }
    });

    const shown = { countryId: scope.countryId, cityId: scope.cityId, timeZone: scope.timeZone, timeZoneSource: scope.timeZoneSource, timeZoneFallback: scope.timeZoneFallback };
    return { outcome: 'ok', summary: { computedAt: now, scope: { ...shown, today: windows.today, week: windows.week }, areas } };
  }

  private read(area: DashboardArea, context: DashboardReadContext): Promise<object> {
    return this.deps.reader[area](context);
  }
}
