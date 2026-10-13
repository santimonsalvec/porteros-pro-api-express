import { IQuery } from '../../../../common/mediator/types.js';

export interface DashboardAreasResult {
  countries: { id: string; name: string; countryCode: string }[];
  /** Every city with a country, satellites included, by name. */
  cities: { id: string; name: string; countryId: string }[];
}

/** What the dashboard's scope filter picks from (contracts/dashboard-system-api.md §1b). */
export class GetDashboardAreasQuery extends IQuery<DashboardAreasResult> {}
