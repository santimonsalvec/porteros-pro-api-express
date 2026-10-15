import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import type { AccountClosureDependencies } from '../../common/accountClosureDependencies.js';
import { toListItem } from '../../common/adminClosureViews.js';
import { closureUsers } from '../../common/closureAdminSupport.js';
import { ListAccountClosuresAdminQuery, type ListAccountClosuresAdminResult } from './listAccountClosuresAdminQuery.js';

/** A search narrows by the users it finds (at most this many); nothing found means nothing listed. */
const SEARCH_LIMIT = 200;

export class ListAccountClosuresAdminQueryHandler implements IQueryHandler<ListAccountClosuresAdminQuery, ListAccountClosuresAdminResult> {
  constructor(private readonly deps: AccountClosureDependencies) {}

  async handle({ filters }: ListAccountClosuresAdminQuery): Promise<ListAccountClosuresAdminResult> {
    const q = filters.q?.trim() ?? '';
    const userIds = q.length >= 2 ? await this.deps.userSearch.findIds(q, SEARCH_LIMIT) : null;
    const { items, totalItems } = await this.deps.closures.list({
      statuses: filters.statuses,
      userIds,
      debt: filters.debt,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const userOf = await closureUsers(this.deps, items);
    return { outcome: 'ok', page: pageOf(items.map((closure) => toListItem(closure, userOf(closure))), filters.page, filters.pageSize, totalItems) };
  }
}
