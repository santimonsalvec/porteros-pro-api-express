import { IQuery } from '../../../../common/mediator/types.js';

export interface DashboardAreasResult {
  countries: { id: string; name: string; countryCode: string }[];
  /** Every market, by name (spec 031). */
  markets: { id: string; name: string; countryId: string }[];
}

/** What the dashboard's scope filter picks from (contracts/dashboard-system-api.md §1b). */
export class GetDashboardAreasQuery extends IQuery<DashboardAreasResult> {}
