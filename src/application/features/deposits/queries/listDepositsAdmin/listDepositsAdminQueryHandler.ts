import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import { depositNames, toDepositRow, type DepositAdminDependencies } from '../../common/depositAdminViews.js';
import { ListDepositsAdminQuery, type ListDepositsAdminResult } from './listDepositsAdminQuery.js';

export class ListDepositsAdminQueryHandler implements IQueryHandler<ListDepositsAdminQuery, ListDepositsAdminResult> {
  constructor(private readonly deps: DepositAdminDependencies) {}

  async handle({ criteria }: ListDepositsAdminQuery): Promise<ListDepositsAdminResult> {
    const { items, totalItems } = await this.deps.reader.list(criteria);
    const names = await depositNames(this.deps, items);
    return { outcome: 'ok', page: pageOf(items.map((deposit) => toDepositRow(deposit, names)), criteria.page, criteria.pageSize, totalItems) };
  }
}
