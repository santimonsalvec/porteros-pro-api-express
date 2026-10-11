import { IQuery } from '../../../../common/mediator/types.js';
import type { CityState, CityView, Page } from '../../common/views.js';

export interface CityFilters {
  countryId?: string;
  regionId?: string;
  q?: string;
  anchor?: boolean;
  state?: CityState;
}

/** The cities, one page at a time (admin spec 003, US1). */
export class ListCitiesQuery extends IQuery<Page<CityView>> {
  constructor(
    readonly filters: CityFilters,
    readonly page: number,
    readonly pageSize: number,
    /** False for pickers, which only need names. */
    readonly withReadiness = true,
  ) {
    super();
  }
}
