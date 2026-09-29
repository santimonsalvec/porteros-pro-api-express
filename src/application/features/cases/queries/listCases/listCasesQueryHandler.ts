import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toCaseItem } from '../../common/caseResponses.js';
import type { ICaseRepository } from '../../common/ports.js';
import { ListCasesQuery, type ListCasesResult } from './listCasesQuery.js';

export class ListCasesQueryHandler implements IQueryHandler<ListCasesQuery, ListCasesResult> {
  constructor(private readonly cases: ICaseRepository) {}

  async handle(query: ListCasesQuery): Promise<ListCasesResult> {
    const { status, page, pageSize } = query;
    const [items, totalItems] = await Promise.all([this.cases.list(status, (page - 1) * pageSize, pageSize), this.cases.count(status)]);
    return { outcome: 'ok', items: items.map(toCaseItem), page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
  }
}
