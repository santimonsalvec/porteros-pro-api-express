import { IQuery } from '../../../../common/mediator/types.js';
import type { Page, RegionView } from '../../common/views.js';

/** The regions, one page at a time, optionally of one country (admin spec 003, US4). */
export class ListRegionsQuery extends IQuery<Page<RegionView>> {
  constructor(
    readonly filters: { countryId?: string; q?: string },
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
