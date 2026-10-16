import { IQuery } from '../../../../common/mediator/types.js';
import type { CityView, Page } from '../../common/views.js';

export interface CityFilters {
  countryId?: string;
  regionId?: string;
  q?: string;
}

/** The municipalities of the billing catalog, one page at a time (admin spec 003, US1; spec 031). */
export class ListCitiesQuery extends IQuery<Page<CityView>> {
  constructor(
    readonly filters: CityFilters,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
