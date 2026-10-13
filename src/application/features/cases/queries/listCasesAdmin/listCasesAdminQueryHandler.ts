import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import { caseItems } from '../../common/caseAdminViews.js';
import type { CasesAdminDependencies } from '../../common/casesAdminDependencies.js';
import type { CaseListFilter } from '../../common/ports.js';
import { ListCasesAdminQuery, type ListCasesAdminResult } from './listCasesAdminQuery.js';

export class ListCasesAdminQueryHandler implements IQueryHandler<ListCasesAdminQuery, ListCasesAdminResult> {
  constructor(private readonly deps: CasesAdminDependencies) {}

  async handle({ criteria }: ListCasesAdminQuery): Promise<ListCasesAdminResult> {
    const filter: CaseListFilter = {
      status: criteria.status ?? null,
      type: criteria.type,
      from: criteria.from,
      to: criteria.to,
      requestIds: undefined,
      order: criteria.order ?? 'default',
    };
    if (criteria.countryId) {
      // Cases don't store their place: the country is narrowed through the matching cases' requests.
      const [cityIds, requestIds] = await Promise.all([this.deps.requestReader.cityIdsOfCountry(criteria.countryId), this.deps.cases.requestIdsMatching(filter)]);
      filter.requestIds = await this.deps.requestReader.requestIdsInCities(requestIds, cityIds);
    }
    const skip = (criteria.page - 1) * criteria.pageSize;
    const [found, totalItems] = await Promise.all([this.deps.cases.search(filter, skip, criteria.pageSize), this.deps.cases.countMatching(filter)]);
    return { outcome: 'ok', page: pageOf(await caseItems(this.deps, found), criteria.page, criteria.pageSize, totalItems) };
  }
}
