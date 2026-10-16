import { IQuery } from '../../../../common/mediator/types.js';
import type { Permission } from '../../../../../domain/staff/permissionCatalog.js';
import type { DashboardAreas } from '../../common/areas.js';
import type { DashboardScope, ScopeResolution } from '../../common/scope.js';
import type { TimeWindow } from '../../common/windows.js';

/** An area computed (`ok`, with its numbers) or one that could not be (FR-019). */
export type AreaResult<T> = ({ status: 'ok' } & T) | { status: 'failed' };

export interface DashboardSummary {
  computedAt: Date;
  scope: Omit<DashboardScope, 'marketIds'> & { today: TimeWindow; week: TimeWindow };
  /** Only the areas the member may see. */
  areas: { [A in keyof DashboardAreas]?: AreaResult<DashboardAreas[A]> };
}

export type GetDashboardSummaryResult = { outcome: 'ok'; summary: DashboardSummary } | Exclude<ScopeResolution, { outcome: 'ok' }>;

/** The dashboard's numbers for a scope (contracts/dashboard-system-api.md §1). */
export class GetDashboardSummaryQuery extends IQuery<GetDashboardSummaryResult> {
  constructor(
    readonly filter: { countryId?: string; marketId?: string; marketIds?: readonly string[] },
    readonly permissions: readonly Permission[],
  ) {
    super();
  }
}
