import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import { topUpNames, toTopUpRow, type TopUpAdminDependencies } from '../../common/topUpAdminViews.js';
import { ListTopUpsAdminQuery, type ListTopUpsAdminResult } from './listTopUpsAdminQuery.js';

export class ListTopUpsAdminQueryHandler implements IQueryHandler<ListTopUpsAdminQuery, ListTopUpsAdminResult> {
  constructor(private readonly deps: TopUpAdminDependencies) {}

  async handle({ criteria }: ListTopUpsAdminQuery): Promise<ListTopUpsAdminResult> {
    const { items, totalItems } = await this.deps.reader.list(criteria);
    const names = await topUpNames(this.deps, items);
    return { outcome: 'ok', page: pageOf(items.map((topUp) => toTopUpRow(topUp, names)), criteria.page, criteria.pageSize, totalItems) };
  }
}
