import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { documentRows, type DocumentAdminDependencies } from '../../common/documentAdminViews.js';
import { ListDocumentsForAdminQuery, type ListDocumentsForAdminResult } from './listDocumentsForAdminQuery.js';

export class ListDocumentsForAdminQueryHandler implements IQueryHandler<ListDocumentsForAdminQuery, ListDocumentsForAdminResult> {
  constructor(private readonly deps: Pick<DocumentAdminDependencies, 'reader' | 'users' | 'clock' | 'issuingEnabled'>) {}

  async handle(query: ListDocumentsForAdminQuery): Promise<ListDocumentsForAdminResult> {
    const { status, page, pageSize, filters } = query;
    const now = this.deps.clock.now();
    const { items, totalItems } = await this.deps.reader.list({ ...filters, ...(status ? { status } : {}), page, pageSize }, now);
    return {
      items: await documentRows(this.deps, items, now),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
      issuingEnabled: this.deps.issuingEnabled,
    };
  }
}
