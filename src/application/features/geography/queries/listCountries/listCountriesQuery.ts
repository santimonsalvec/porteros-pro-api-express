import { IQuery } from '../../../../common/mediator/types.js';
import type { CountryView, Page } from '../../common/views.js';

/** The countries, one page at a time (admin spec 003, US4). */
export class ListCountriesQuery extends IQuery<Page<CountryView>> {
  constructor(
    readonly filters: { q?: string },
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
